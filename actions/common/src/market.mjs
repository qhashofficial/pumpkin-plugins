import { readBoundedJson, safeResponseBody } from './diagnostics.mjs';

/** Base URL of the public Pumpkin Market, used when the api-url input is empty. */
export const MARKET_URL = 'https://market.pumpkinmc.org';

const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Normalizes the api-url input and checks that the API token will only travel over HTTPS.
 *
 * @throws Error when the URL isn't absolute, or uses plain HTTP for a host other than loopback.
 */
export function marketUrl(input) {
    const value = input.trim() || MARKET_URL;
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('api-url must be an absolute URL');
    }
    // Plain HTTP is allowed only for local test servers; the action sends a Bearer token.
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHosts.has(url.hostname))) {
        throw new Error('api-url must use https');
    }
    return value.replace(/\/+$/, '');
}

/** Fetches a Market URL with a 30-second timeout. */
export function marketFetch(url, options = {}) {
    return fetch(url, { ...options, signal: AbortSignal.timeout(30_000) });
}

/**
 * Resolves a numeric database ID or public ID to its listing.
 *
 * @returns The listing, or undefined when Market answers 404.
 * @throws Error on any other failed response or when the response isn't a valid listing.
 */
export async function findListingById(baseUrl, id) {
    const response = await marketFetch(`${baseUrl}/api/v1/rest/plugins/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Could not look up Market plugin ${JSON.stringify(id)} (${response.status})`);
    let listing;
    try {
        listing = await readBoundedJson(response);
    } catch (error) {
        if (error instanceof RangeError) throw error;
        throw new Error('Market plugin lookup response was not valid JSON');
    }
    if (!isValidListing(listing)) throw new Error('Market plugin lookup response was not a valid listing');
    return listing;
}

/**
 * Finds a listing by an exact, case-insensitive name match in Market search results. Market has no
 * direct lookup by name: `GET /plugins/{name}` answers 404 for listings that exist.
 *
 * @param secret - Token to redact from a failed search response.
 * @returns The listing, or undefined when no listing has that name.
 * @throws Error when the search fails, a match isn't a valid listing, or the name is ambiguous.
 */
export async function findListingByName(baseUrl, name, secret) {
    const searchUrl = new URL(`${baseUrl}/api/v1/rest/plugins`);
    searchUrl.searchParams.set('q', name);
    searchUrl.searchParams.set('limit', '20');
    const response = await marketFetch(searchUrl);
    if (!response.ok)
        throw new Error(
            `Could not search Market plugins (${response.status}): ${await safeResponseBody(response, secret)}`,
        );
    const listings = await readBoundedJson(response);
    if (!Array.isArray(listings)) throw new Error('Market plugin search response was not an array');
    const matches = listings.filter((listing) => isExactName(listing, name));
    if (matches.some((listing) => !isValidListing(listing)))
        throw new Error('Market plugin lookup response was not a valid listing');
    if (matches.length > 1) throw new Error(`Market has multiple listings named ${JSON.stringify(name)}`);
    return matches[0];
}

// A listing without a published version has `version` null, an empty string or no field at all.
function isValidListing(listing) {
    return (
        Number.isInteger(listing?.id) &&
        typeof listing.name === 'string' &&
        Boolean(listing.name) &&
        (listing.version === undefined || listing.version === null || typeof listing.version === 'string')
    );
}

function isExactName(listing, name) {
    return typeof listing?.name === 'string' && listing.name.toLowerCase() === name.toLowerCase();
}
