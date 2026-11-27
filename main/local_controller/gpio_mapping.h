#ifndef LOCAL_CONTROLLER_GPIO_MAPPING_H
#define LOCAL_CONTROLLER_GPIO_MAPPING_H

#include "sdkconfig.h"

namespace local_controller
{
    enum class GpioRole
    {
        sensor_input_1,
        light_relay_1
    };

    struct GpioMapping
    {
        GpioRole role;
        int pin;
    };

    enum class GpioMappingStatus
    {
        valid,
        unsupported_pin,
        conflicting_pin
    };

    constexpr GpioMapping gpio_mappings[] = {
        {GpioRole::sensor_input_1, CONFIG_LOCAL_GPIO_SENSOR_INPUT_1},
        {GpioRole::light_relay_1, CONFIG_LOCAL_GPIO_LIGHT_RELAY_1}
    };

    constexpr bool is_esp32s3_gpio_number(int pin)
    {
        return (pin >= 0 && pin <= 21) || (pin >= 26 && pin <= 48);
    }

    constexpr GpioMappingStatus validate_gpio_mappings()
    {
        for (unsigned int index = 0; index < sizeof(gpio_mappings) / sizeof(gpio_mappings[0]); ++index)
        {
            const int pin = gpio_mappings[index].pin;
            if (pin == -1)
            {
                continue;
            }
            if (!is_esp32s3_gpio_number(pin))
            {
                return GpioMappingStatus::unsupported_pin;
            }
            for (unsigned int other = index + 1; other < sizeof(gpio_mappings) / sizeof(gpio_mappings[0]); ++other)
            {
                if (gpio_mappings[other].pin == pin)
                {
                    return GpioMappingStatus::conflicting_pin;
                }
            }
        }
        return GpioMappingStatus::valid;
    }

    constexpr bool gpio_role_is_assigned(GpioRole role)
    {
        for (const GpioMapping &mapping : gpio_mappings)
        {
            if (mapping.role == role)
            {
                return mapping.pin != -1;
            }
        }
        return false;
    }

    static_assert(validate_gpio_mappings() == GpioMappingStatus::valid,
                  "GPIO role mapping contains an unsupported or conflicting pin.");
}

#endif
