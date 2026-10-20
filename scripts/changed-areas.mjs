// Classifies changed files for CI: plugin/repo code, action directories, extension directories, and documentation.
// scripts/ci-gate.mjs turns these outputs into the list of CI jobs the change needs.
// See the Jobs table in docs/ci-and-releases.md.
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { COMMIT_LOG_ARGS, parseCommitLog } from './utils/commit-log.mjs';
import { changedLockfileImporters, readGitFile, workspaceLayoutChanged } from './utils/workspace-changes.mjs';

/** A changed file matching any of these is documentation, which nothing that builds or tests reads. */
const DOCS = [/\.md$/, /^docs\//, /^LICENSE$/, /^(packages|tools|actions|extensions)\/[^/]+\/docs(?:\/|$)/];
/** Label and CodeRabbit settings affect automation configuration, not plugin or repository code. */
const LABEL_CONFIGURATION = new Set(['.github/labels.yml', '.coderabbit.yaml']);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
/** The subject of the release workflow's generated README commit, which reruns the docs checks. */
const GENERATED_READMES_SUBJECT = 'docs: update generated READMEs';
/**
 * Commit subjects that a merged release PR brings to the default branch. The release-pr job in
 * .github/workflows/release.yml writes the follow-up commits; keep these in step with it.
 */
const RELEASE_PR_SUBJECTS = {
    release: [/^chore\(master\): release /, /^chore: retire first-release pins$/],
    followUp: [/^fix\(create-pumpkin-plugin\): sync starter tool versions$/, /^docs: update generated READMEs$/],
};

/** Resolves the generator smoke test's inputs from the checked-out repository. */
function generatorInputs() {
    const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' });
    if (tracked.status !== 0) {
        throw new Error(`Could not list repository files for generator selection: ${tracked.stderr.trim()}`);
    }
    const files = tracked.stdout.split('\0').filter(Boolean);
    const relevantFiles = new Set();
    const relevantDirectories = new Set();
    const addPattern = (pattern) => {
        const normalized = path.posix.normalize(pattern.replace(/^\.\//, ''));
        if (!/[*?]/.test(normalized)) {
            relevantFiles.add(normalized);
            return;
        }
        for (const file of files) if (path.posix.matchesGlob(file, normalized)) relevantFiles.add(file);
    };
    const readJson = (file) => JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8'));
    const packageByName = new Map();
    for (const file of files.filter((entry) => entry.endsWith('/package.json'))) {
        const manifest = readJson(file);
        if (typeof manifest.name === 'string') {
            packageByName.set(manifest.name, { directory: path.posix.dirname(file), manifest });
        }
    }

    const generatorConfigs = files.filter((file) => {
        if (!/\.(?:c|m)?(?:j|t)s$/.test(file)) return false;
        return /^\s*[\w$]+\.setGenerator\(/m.test(readFileSync(path.join(repositoryRoot, file), 'utf8'));
    });
    for (const file of generatorConfigs) relevantDirectories.add(path.posix.dirname(file));

    const generatedPackageDependencies = new Set();
    for (const directory of relevantDirectories) {
        for (const file of files.filter(
            (entry) => entry.startsWith(`${directory}/`) && entry.endsWith('/package.json.hbs'),
        )) {
            const source = readFileSync(path.join(repositoryRoot, file), 'utf8');
            for (const section of source.matchAll(
                /"(?:dependencies|devDependencies|optionalDependencies|peerDependencies)"\s*:\s*\{([\s\S]*?)\}/g,
            )) {
                for (const [, name] of section[1].matchAll(/"([^"]+)"\s*:/g)) {
                    if (packageByName.has(name)) generatedPackageDependencies.add(name);
                }
            }
        }
    }
    const rootManifest = readJson('package.json');
    for (const dependencies of [rootManifest.dependencies, rootManifest.devDependencies]) {
        for (const name of Object.keys(dependencies ?? {})) {
            if (packageByName.has(name)) generatedPackageDependencies.add(name);
        }
    }
    const pendingPackages = [...generatedPackageDependencies];
    const visitedPackages = new Set();
    while (pendingPackages.length) {
        const name = pendingPackages.pop();
        if (visitedPackages.has(name)) continue;
        visitedPackages.add(name);
        const workspacePackage = packageByName.get(name);
        if (!workspacePackage) continue;
        relevantDirectories.add(workspacePackage.directory);
        for (const dependencies of [
            workspacePackage.manifest.dependencies,
            workspacePackage.manifest.devDependencies,
            workspacePackage.manifest.optionalDependencies,
            workspacePackage.manifest.peerDependencies,
        ]) {
            for (const dependency of Object.keys(dependencies ?? {})) {
                if (packageByName.has(dependency)) pendingPackages.push(dependency);
            }
        }
    }

    for (const file of files.filter((entry) => !entry.includes('/'))) {
        if (file === 'package.json' || /(?:lock|workspace)/i.test(file)) relevantFiles.add(file);
    }
    const turboConfig = files.find((file) => {
        if (file.includes('/') || !file.endsWith('.json')) return false;
        const config = readJson(file);
        return config.tasks && Array.isArray(config.globalDependencies);
    });
    if (turboConfig) {
        relevantFiles.add(turboConfig);
        for (const input of readJson(turboConfig).globalDependencies) addPattern(input);
    }

    const workflowFiles = files.filter((file) => file.startsWith('.github/workflows/') && /\.ya?ml$/.test(file));
    let generatorWorkflow;
    let generatorJob;
    for (const file of workflowFiles) {
        const lines = readFileSync(path.join(repositoryRoot, file), 'utf8').split('\n');
        const start = lines.findIndex((line) => /^ {4}generator:\s*$/.test(line));
        if (start === -1) continue;
        const nextJob = lines.findIndex((line, index) => index > start && /^ {4}[\w-]+:\s*$/.test(line));
        generatorWorkflow = file;
        generatorJob = lines.slice(start, nextJob === -1 ? undefined : nextJob).join('\n');
        break;
    }
    if (!generatorWorkflow) throw new Error('Could not find the generator job in a GitHub workflow.');
    relevantFiles.add(generatorWorkflow);
    for (const [, localPath] of generatorJob.matchAll(/^\s*(?:-\s*)?uses:\s+\.\/([^#\s@]+)/gm)) {
        relevantDirectories.add(path.posix.normalize(localPath));
    }

    const scripts = rootManifest.scripts ?? {};
    const pendingScripts = Object.keys(scripts).filter((name) => {
        const escapedName = name.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
        return new RegExp(`\\bpnpm\\s+(?:run\\s+)?${escapedName}(?=\\s|$)`).test(generatorJob);
    });
    const visitedScripts = new Set();
    while (pendingScripts.length) {
        const name = pendingScripts.pop();
        if (visitedScripts.has(name)) continue;
        visitedScripts.add(name);
        const command = scripts[name];
        for (const [, scriptPath] of command.matchAll(/\bnode\s+([^\s"'`]+\.mjs)/g)) addPattern(scriptPath);
        for (const [, nestedName] of command.matchAll(/\bpnpm\s+(?:run\s+)?([\w:-]+)/g)) {
            if (Object.hasOwn(scripts, nestedName)) pendingScripts.push(nestedName);
        }
    }

    if (generatorConfigs.length === 0) throw new Error('Could not find the repository generator configuration.');
    return { files: relevantFiles, directories: relevantDirectories };
}

/** Finds workspace inputs that participate in real-server tests and their build tasks. */
function integrationInputs() {
    const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' });
    if (tracked.status !== 0) {
        throw new Error(`Could not list repository files for integration selection: ${tracked.stderr.trim()}`);
    }
    const files = tracked.stdout.split('\0').filter(Boolean);
    const readJson = (file) => JSON.parse(readFileSync(path.join(repositoryRoot, file), 'utf8'));
    const packageByName = new Map();
    for (const file of files.filter((entry) => entry.endsWith('/package.json'))) {
        const manifest = readJson(file);
        if (typeof manifest.name === 'string') {
            packageByName.set(manifest.name, { directory: path.posix.dirname(file), manifest });
        }
    }

    const turboConfigFile = files.find((file) => {
        if (file.includes('/') || !file.endsWith('.json')) return false;
        const config = readJson(file);
        return config.tasks && Array.isArray(config.globalDependencies);
    });
    if (!turboConfigFile) throw new Error('Could not find the Turborepo configuration for integration selection.');
    const turboConfig = readJson(turboConfigFile);
    const globalFiles = new Set([turboConfigFile]);
    for (const file of files.filter((entry) => !entry.includes('/'))) {
        if (file === 'package.json') globalFiles.add(file);
    }
    for (const input of turboConfig.globalDependencies) {
        const normalized = path.posix.normalize(input);
        if (normalized !== 'pnpm-workspace.yaml') globalFiles.add(normalized);
    }

    const directories = new Set();
    const visitedPackages = new Set();
    const packageDependencies = (manifest) =>
        [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies, manifest.devDependencies]
            .flatMap((dependencies) => Object.keys(dependencies ?? {}))
            .filter((name) => packageByName.has(name));
    const addRuntimePackage = (name) => {
        if (visitedPackages.has(name)) return;
        visitedPackages.add(name);
        const workspacePackage = packageByName.get(name);
        if (!workspacePackage) return;
        directories.add(workspacePackage.directory);
        for (const dependency of packageDependencies(workspacePackage.manifest)) addRuntimePackage(dependency);
    };
    const visitedTasks = new Set();
    const visitTask = (name, taskName) => {
        const key = `${name}#${taskName}`;
        if (visitedTasks.has(key)) return;
        visitedTasks.add(key);
        const workspacePackage = packageByName.get(name);
        if (!workspacePackage) return;
        if (workspacePackage.manifest.scripts?.[taskName]) directories.add(workspacePackage.directory);
        const task = turboConfig.tasks[key] ?? turboConfig.tasks[taskName];
        for (const dependency of task?.dependsOn ?? []) {
            const separator = dependency.indexOf('#');
            if (separator !== -1) {
                visitTask(dependency.slice(0, separator), dependency.slice(separator + 1));
            } else if (dependency.startsWith('^')) {
                const dependencyTask = dependency.slice(1);
                for (const child of packageDependencies(workspacePackage.manifest)) {
                    if (packageByName.get(child).manifest.scripts?.[dependencyTask]) visitTask(child, dependencyTask);
                }
            } else {
                visitTask(name, dependency);
            }
        }
    };

    for (const [name, workspacePackage] of packageByName) {
        if (workspacePackage.manifest.scripts?.['test:integration']) {
            addRuntimePackage(name);
            visitTask(name, 'test:integration');
        }
    }

    const allDirectories = new Set();
    const workflowFiles = files.filter((entry) => entry.startsWith('.github/workflows/') && /\.ya?ml$/.test(entry));
    for (const file of workflowFiles) {
        const lines = readFileSync(path.join(repositoryRoot, file), 'utf8').split('\n');
        const start = lines.findIndex((line) => /^ {4}integration:\s*$/.test(line));
        if (start === -1) continue;
        globalFiles.add(file);
        const nextJob = lines.findIndex((line, index) => index > start && /^ {4}[\w-]+:\s*$/.test(line));
        const job = lines.slice(start, nextJob === -1 ? undefined : nextJob).join('\n');
        for (const [, localPath] of job.matchAll(/^\s*(?:-\s*)?uses:\s+\.\/([^#\s@]+)/gm)) {
            allDirectories.add(path.posix.normalize(localPath));
        }
        break;
    }
    const packageByDirectory = new Map(
        [...packageByName].map(([name, workspacePackage]) => [
            workspacePackage.directory,
            { name, ...workspacePackage },
        ]),
    );
    return { directories, globalFiles, allDirectories, packageByDirectory, workflowFiles };
}

/**
 * Finds what the reusable workflow behind a CI job reads: the workflow file, its local actions, and
 * the root scripts it runs through `pnpm run` with their relative imports.
 */
function calledWorkflowInputs(workflowFiles, jobName) {
    const files = new Set();
    const directories = new Set();
    const scripts = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')).scripts ?? {};
    for (const file of workflowFiles) {
        const lines = readFileSync(path.join(repositoryRoot, file), 'utf8').split('\n');
        const start = lines.findIndex((line) => line.trimEnd() === `    ${jobName}:`);
        if (start === -1) continue;
        const nextJob = lines.findIndex((line, index) => index > start && /^ {4}[\w-]+:\s*$/.test(line));
        const job = lines.slice(start, nextJob === -1 ? undefined : nextJob).join('\n');
        for (const [, workflow] of job.matchAll(/^\s*uses:\s+\.\/(\.github\/workflows\/[^#\s@]+)/gm)) {
            files.add(workflow);
            const source = readFileSync(path.join(repositoryRoot, workflow), 'utf8');
            for (const [, localPath] of source.matchAll(/^\s*(?:-\s*)?uses:\s+\.\/([^#\s@]+)/gm)) {
                directories.add(path.posix.normalize(localPath));
            }
            for (const [, name] of source.matchAll(/\bpnpm\s+run\s+([\w:-]+)/g)) {
                for (const [, script] of (scripts[name] ?? '').matchAll(/\bnode\s+([^\s"'`]+\.mjs)/g)) {
                    files.add(path.posix.normalize(script));
                    const source = readFileSync(path.join(repositoryRoot, script), 'utf8');
                    for (const [, specifier] of source.matchAll(/\bimport\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/g)) {
                        files.add(path.posix.join(path.posix.dirname(script), specifier));
                    }
                }
            }
        }
        break;
    }
    return { files, directories };
}

/** Collects the directories of the named workspace packages and of their workspace dependencies. */
function workspaceClosure(packageByDirectory, names) {
    const packageByName = new Map([...packageByDirectory.values()].map((entry) => [entry.name, entry]));
    const directories = new Set();
    const visit = (name) => {
        const workspacePackage = packageByName.get(name);
        if (!workspacePackage || directories.has(workspacePackage.directory)) return;
        directories.add(workspacePackage.directory);
        const { manifest } = workspacePackage;
        for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies]) {
            for (const dependency of Object.keys(dependencies ?? {})) visit(dependency);
        }
    };
    for (const name of names) visit(name);
    return directories;
}

/** Combines a set of workspace packages with the reusable workflow a CI job calls for them. */
function jobInputs(packageByDirectory, workflowFiles, jobName, selectsPackage) {
    const packages = [...packageByDirectory.values()].filter(selectsPackage);
    const workflow = calledWorkflowInputs(workflowFiles, jobName);
    const directories = workspaceClosure(
        packageByDirectory,
        packages.map(({ name }) => name),
    );
    for (const directory of workflow.directories) directories.add(directory);
    return { files: workflow.files, directories };
}

/** Finds what the engine comparison builds and runs: the benchmark packages and their workflow. */
function benchmarkInputs(packageByDirectory, workflowFiles) {
    return jobInputs(packageByDirectory, workflowFiles, 'engine-comparison', ({ directory }) =>
        directory.startsWith('benchmarks/'),
    );
}

/**
 * Finds what the external consumer test packs and runs: the public tools, which set
 * `publishConfig.access: "public"` as scripts/utils/tool-packages.mjs reads them, and the workflow.
 */
function externalConsumerInputs(packageByDirectory, workflowFiles) {
    return jobInputs(
        packageByDirectory,
        workflowFiles,
        'external-consumer',
        ({ directory, manifest }) =>
            directory.startsWith('tools/') && manifest.private !== true && manifest.publishConfig?.access === 'public',
    );
}

/** Finds the actions whose source imports the shared `actions/common/` helpers. */
function commonConsumers() {
    const tracked = spawnSync('git', ['ls-files', '-z', 'actions'], { cwd: repositoryRoot, encoding: 'utf8' });
    if (tracked.status !== 0) {
        throw new Error(`Could not list action files for common helper consumers: ${tracked.stderr.trim()}`);
    }
    const consumers = new Set();
    for (const file of tracked.stdout.split('\0')) {
        const [, action] = file.match(/^actions\/([^/]+)\/src\/[^/]+\.m?js$/) ?? [];
        if (!action || action === 'common') continue;
        if (readFileSync(path.join(repositoryRoot, file), 'utf8').includes('../../common/')) consumers.add(action);
    }
    return consumers;
}

const args = process.argv.slice(2);
const configOnlyMode = args[0] === '--config-only';
const positionalArgs = configOnlyMode ? args.slice(1) : args;
if (positionalArgs.includes('--help') || positionalArgs.includes('-h')) {
    console.log('Usage: changed-areas.mjs <base> [head]');
    process.exit(0);
}
const [base, head = 'HEAD'] = positionalArgs;
if (!base) {
    console.error('Usage: changed-areas.mjs <base> [head]');
    process.exit(1);
}

const diff = spawnSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' });
if (diff.status !== 0) {
    // Failing here rather than reporting no changes: the code jobs must not be skipped by accident.
    console.error(`Could not diff ${base}...${head}: ${diff.stderr.trim()}`);
    process.exit(1);
}
const changedFiles = diff.stdout.split('\n').filter(Boolean);
const configOnly = changedFiles.length > 0 && changedFiles.every((file) => LABEL_CONFIGURATION.has(file));
if (configOnlyMode) {
    console.log(`Label configuration only: ${configOnly}`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `config_only=${configOnly}\n`);
    process.exit(0);
}

const commitLog = spawnSync('git', [...COMMIT_LOG_ARGS, `${base}..${head}`], { encoding: 'utf8' });
if (commitLog.status !== 0) {
    console.error(`Could not read commits between ${base} and ${head}: ${commitLog.stderr.trim()}`);
    process.exit(1);
}
const { commits, files: changedByNonIgnoredCommits } = parseCommitLog(commitLog.stdout);
const subjects = commits.map(({ subject }) => subject);
const generatedReadmes = commits.some(({ subject, ignored }) => !ignored && subject === GENERATED_READMES_SUBJECT);
const isRelease = (subject) => RELEASE_PR_SUBJECTS.release.some((pattern) => pattern.test(subject));
const isFollowUp = (subject) => RELEASE_PR_SUBJECTS.followUp.some((pattern) => pattern.test(subject));
// A merged release PR only bumps versions and regenerates files from commits that already passed
// CI, so its push skips the expensive suites. CI's push trigger only covers the default branch.
const skipExpensiveChecks =
    process.env.GITHUB_EVENT_NAME === 'push' &&
    subjects.some(isRelease) &&
    subjects.every((subject) => isRelease(subject) || isFollowUp(subject));
const changed = diff.stdout.split('\n').filter((file) => file.length > 0 && changedByNonIgnoredCommits.has(file));
const isDocs = (file) => DOCS.some((pattern) => pattern.test(file));
const actionPaths = changed.filter((file) => !isDocs(file) && /^actions\/[^/]+\//.test(file));
const actions = [...new Set(actionPaths.map((file) => file.split('/')[1]))].filter((name) => name !== 'common').sort();
const actionCodePaths = actionPaths.filter((file) => !file.endsWith('/version.txt'));
const tests = new Set(actionCodePaths.map((file) => file.split('/')[1]));
if (tests.has('common')) for (const consumer of commonConsumers()) tests.add(consumer);
const actionsToTest = [...tests].sort();
const extensionPaths = changed.filter((file) => !isDocs(file) && /^extensions\/[^/]+\//.test(file));
const extensions = [...new Set(extensionPaths.map((file) => file.split('/')[1]))].sort();
const extensionsToTest = [
    ...new Set(
        extensionPaths
            .filter((file) => !['README.md', 'CHANGELOG.md', 'LICENSE'].includes(path.basename(file)))
            .map((file) => file.split('/')[1]),
    ),
].sort();
const code = changed.filter(
    (file) =>
        !isDocs(file) &&
        !LABEL_CONFIGURATION.has(file) &&
        !/^actions\/[^/]+\//.test(file) &&
        !/^extensions\/[^/]+\//.test(file),
);
const generatorRelevant = code.length > 0 ? generatorInputs() : undefined;
const generator = Boolean(
    generatorRelevant &&
        changed.some(
            (file) =>
                !isDocs(file) &&
                (generatorRelevant.files.has(file) ||
                    [...generatorRelevant.directories].some((directory) => file.startsWith(`${directory}/`))),
        ),
);
const integrationRelevant = code.length > 0 ? integrationInputs() : undefined;
/** Checks a changed file against the workspace-wide inputs, which can be Turborepo globs. */
const isGlobalInput = (file) =>
    [...(integrationRelevant?.globalFiles ?? [])].some((input) => path.posix.matchesGlob(file, input));
const lockfileChanged = code.includes('pnpm-lock.yaml');
const workspaceConfigChanged = code.includes('pnpm-workspace.yaml');
const lockfileImporterDirectories = lockfileChanged ? changedLockfileImporters(repositoryRoot, base, head) : [];
const lockfileWideChanged =
    lockfileChanged &&
    (!lockfileImporterDirectories ||
        lockfileImporterDirectories.length === 0 ||
        lockfileImporterDirectories.includes('.'));
const workspaceLayoutChangedForIntegration =
    workspaceConfigChanged && workspaceLayoutChanged(repositoryRoot, base, head);
/** Keep the benchmark comparison scoped to its dedicated real-server workflow. */
const benchmarkOnly = code.length > 0 && code.every((file) => file.startsWith('benchmarks/engine-comparison/'));
const integrationRuntimeChanged = Boolean(
    integrationRelevant &&
        (code.some((file) =>
            [...integrationRelevant.directories].some((directory) => file.startsWith(`${directory}/`)),
        ) ||
            lockfileImporterDirectories?.some((directory) => integrationRelevant.directories.has(directory))),
);
const integrationAllChanged = Boolean(
    integrationRelevant &&
        (workspaceLayoutChangedForIntegration ||
            lockfileWideChanged ||
            code.some(
                (file) =>
                    isGlobalInput(file) ||
                    [...integrationRelevant.allDirectories].some((directory) => file.startsWith(`${directory}/`)),
            )),
);
let integrationScope = benchmarkOnly
    ? 'benchmark'
    : integrationAllChanged
      ? 'all'
      : integrationRuntimeChanged
        ? 'affected'
        : 'none';
/** Checks whether the change touches workspace-wide inputs or the given files and directories. */
const touchesInputs = (inputs) =>
    workspaceLayoutChangedForIntegration ||
    lockfileWideChanged ||
    lockfileImporterDirectories?.some((directory) => inputs.directories.has(directory)) ||
    code.some(
        (file) =>
            inputs.files.has(file) ||
            (isGlobalInput(file) && !file.startsWith('.github/')) ||
            [...inputs.directories].some((directory) => file.startsWith(`${directory}/`)),
    );
const benchmark = Boolean(
    integrationRelevant &&
        touchesInputs(benchmarkInputs(integrationRelevant.packageByDirectory, integrationRelevant.workflowFiles)),
);
// Pull requests test macOS and Windows only when packed tools or the test itself change; pushes test all.
const externalConsumerFull =
    process.env.GITHUB_EVENT_NAME === 'push' ||
    Boolean(
        integrationRelevant &&
            touchesInputs(
                externalConsumerInputs(integrationRelevant.packageByDirectory, integrationRelevant.workflowFiles),
            ),
    );
const integrationPackages = new Set();
if (integrationScope === 'affected') {
    for (const directory of integrationRelevant.directories) {
        const changedPackage = code.some((file) => file.startsWith(`${directory}/`));
        const changedImporter = lockfileImporterDirectories?.includes(directory);
        if (!changedPackage && !changedImporter) continue;
        let name = integrationRelevant.packageByDirectory.get(directory)?.name;
        if (!name && changedImporter) {
            const previousManifest = readGitFile(repositoryRoot, base, `${directory}/package.json`);
            try {
                name = JSON.parse(previousManifest ?? '').name;
            } catch {
                name = undefined;
            }
        }
        if (name) integrationPackages.add(name);
    }
    if (integrationPackages.size === 0) integrationScope = 'all';
}

console.log(`${changed.length} changed file(s) between ${base} and ${head}`);
if (code.length) console.log(`Code: ${code.join(', ')}`);
else console.log('No plugin or repository code, so the plugin code jobs are skipped.');
if (actions.length) console.log(`Changed actions: ${actions.join(', ')}`);
if (actionsToTest.length) console.log(`Actions to test: ${actionsToTest.join(', ')}`);
if (extensions.length) console.log(`Changed extensions: ${extensions.join(', ')}`);
if (extensionsToTest.length) console.log(`Extensions to test: ${extensionsToTest.join(', ')}`);
console.log(`Generator smoke test: ${generator ? 'selected' : 'skipped'}`);
console.log(`Integration scope: ${integrationScope}`);
console.log(`Engine comparison inputs changed: ${benchmark}`);
console.log(`External consumer platforms: ${externalConsumerFull ? 'all' : 'Linux only'}`);
if (generatedReadmes) console.log('Generated README update commit detected.');
if (skipExpensiveChecks) console.log('Release merge: the expensive suites are skipped.');
if (integrationPackages.size) console.log(`Integration packages: ${[...integrationPackages].sort().join(', ')}`);

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        `code=${code.length > 0}\nconfig_only=${configOnly}\nactions=${JSON.stringify(actions)}\nactions_to_test=${JSON.stringify(actionsToTest)}\nextensions=${JSON.stringify(extensions)}\nextensions_to_test=${JSON.stringify(extensionsToTest)}\ngenerated_readmes=${generatedReadmes}\ngenerator=${generator}\nintegration_scope=${integrationScope}\nskip_expensive_checks=${skipExpensiveChecks}\nbenchmark=${benchmark}\nexternal_consumer_full=${externalConsumerFull}\n${integrationPackages.size ? `integration_packages=${JSON.stringify([...integrationPackages].sort())}\n` : ''}`,
    );
}
