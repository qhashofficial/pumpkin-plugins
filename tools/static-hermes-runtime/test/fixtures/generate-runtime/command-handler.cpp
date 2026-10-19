#include <cassert>
#include <cstdint>
#include <cstring>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#include "runtime-contract-support.hpp"

enum class ResourceKind { CommandSender, Server, ConsumedArgs };
int senderDrops = 0;
int serverDrops = 0;
int argsDrops = 0;

struct ResourceState {
    ResourceKind kind;
    std::int32_t handle;
    bool owned;
    void drop() {
        if (!owned) return;
        owned = false;
        if (kind == ResourceKind::CommandSender) senderDrops++;
        if (kind == ResourceKind::Server) serverDrops++;
        if (kind == ResourceKind::ConsumedArgs) argsDrops++;
    }
};

Value wrapResourceObject(Runtime &runtime, std::shared_ptr<HostObject> resource) {
    return Object::createFromHostObject(runtime, std::move(resource));
}

template <typename State>
class ResourceObject : public HostObject {
  public:
    explicit ResourceObject(std::shared_ptr<State> state) : state(std::move(state)) {}
    std::shared_ptr<State> state;
};
class CommandSenderObject : public ResourceObject<ResourceState> { using ResourceObject::ResourceObject; };
class ServerObject : public ResourceObject<ResourceState> { using ResourceObject::ResourceObject; };
class ConsumedArgsObject : public ResourceObject<ResourceState> { using ResourceObject::ResourceObject; };

struct plugin_own_command_sender_t { std::int32_t __handle; };
struct plugin_own_server_instance_t { std::int32_t __handle; };
struct plugin_own_consumed_args_t { std::int32_t __handle; };
struct plugin_command_error_t { char message[128]; };

void pumpkin_plugin_command_command_sender_drop_own(plugin_own_command_sender_t) {}
void pumpkin_plugin_server_server_drop_own(plugin_own_server_instance_t) {}
void pumpkin_plugin_command_consumed_args_drop_own(plugin_own_consumed_args_t) {}
void initializeRuntime() {}

Value commandResult(19);
std::string invokedExport;
std::vector<Value> receivedArgs;
Value callExport(const char *name, Value *args, std::size_t count) {
    invokedExport = name;
    receivedArgs.assign(args, args + count);
    return commandResult;
}
template <typename Integer>
Integer wasiInputInteger(Runtime &runtime, const Value &value, const char *witType) {
    const double number = value.asNumber();
    if (number != static_cast<double>(static_cast<long long>(number)) ||
        number < static_cast<double>(std::numeric_limits<Integer>::lowest()) ||
        number > static_cast<double>(std::numeric_limits<Integer>::max()))
        throw JSError(runtime, std::string("Expected an integral value in the WIT ") + witType + " range");
    return static_cast<Integer>(number);
}
bool setCommandFailure(plugin_command_error_t *, const JSError &) { return false; }
void setCommandError(plugin_command_error_t *error, const std::string &message) {
    std::strncpy(error->message, message.c_str(), sizeof(error->message) - 1);
}

/* GENERATED_COMMAND_HANDLER */

int main() {
    Runtime runtime;
    jsRuntime = &runtime;
    int result = -1;
    plugin_command_error_t error{};
    const bool handled = exports_plugin_handle_command(
        23, {41}, {42}, {43}, &result, &error);
    assert(handled);
    assert(result == 19);
    assert(std::string(error.message).empty());
    assert(invokedExport == "handleCommand");
    assert(receivedArgs.size() == 4);
    assert(receivedArgs[0].isNumber() && receivedArgs[0].asNumber() == 23);
    const auto sender = std::dynamic_pointer_cast<CommandSenderObject>(
        receivedArgs[1].asObject(runtime).getHostObject(runtime));
    const auto server = std::dynamic_pointer_cast<ServerObject>(
        receivedArgs[2].asObject(runtime).getHostObject(runtime));
    const auto args = std::dynamic_pointer_cast<ConsumedArgsObject>(
        receivedArgs[3].asObject(runtime).getHostObject(runtime));
    assert(sender && sender->state->handle == 41);
    assert(server && server->state->handle == 42);
    assert(args && args->state->handle == 43);
    assert(senderDrops == 1 && serverDrops == 1 && argsDrops == 1);

    // A result outside the WIT s32 range fails the command instead of being truncated.
    commandResult = Value(1e12);
    result = -1;
    error = {};
    assert(!exports_plugin_handle_command(24, {51}, {52}, {53}, &result, &error));
    assert(result == 0);
    assert(std::string(error.message).find("s32") != std::string::npos);
    assert(senderDrops == 2 && serverDrops == 2 && argsDrops == 2);
}
