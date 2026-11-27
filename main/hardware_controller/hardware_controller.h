#ifndef HARDWARE_CONTROLLER_H
#define HARDWARE_CONTROLLER_H

#include <cstddef>
#include <cstdint>

namespace hardware_controller
{
    struct HardwareSnapshot
    {
        bool hardware_enabled;
        bool dht_valid;
        float temperature_c;
        float humidity_pct;
        bool mq2_valid;
        bool mq2_preheating;
        bool smoke_alert;
        int mq2_pin_mv;
        int mq2_scaled_mv;
        int mq2_percent;
        bool living_light_on;
        bool bedroom_light_on;
        bool kitchen_light_on;
        bool hallway_light_on;
        bool door_unlocked;
        bool fan_on;
        uint64_t uptime_ms;
        uint64_t dht_last_ok_ms;
    };

    struct CommandResult
    {
        bool accepted;
        bool state_active;
        bool is_lock;
        int gpio_pin;
        const char *device_id;
        const char *zone_id;
        const char *device_type;
        const char *state_label;
        const char *error_message;
    };

    bool init();
    bool start_polling_task();
    bool get_snapshot(HardwareSnapshot &out);
    bool execute_device_command(const char *device_id, const char *target_state, CommandResult &out);
    bool resolve_device_metadata(const char *device_id, CommandResult &out);
    bool format_snapshot_json(const HardwareSnapshot &snap, const char *device_id, char *out_buf, std::size_t out_size);
    bool format_command_ack_json(const char *command_id, const CommandResult &res, uint64_t timestamp_ms, char *out_buf, std::size_t out_size);
}

#endif
