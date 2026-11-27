#ifndef LOCAL_CONTROLLER_GPIO_MAPPING_H
#define LOCAL_CONTROLLER_GPIO_MAPPING_H

#include "sdkconfig.h"

#ifndef CONFIG_LOCAL_GPIO_MQ2_ADC
#define CONFIG_LOCAL_GPIO_MQ2_ADC -1
#endif
#ifndef CONFIG_LOCAL_GPIO_DHT11
#define CONFIG_LOCAL_GPIO_DHT11 -1
#endif
#ifndef CONFIG_LOCAL_GPIO_LED_LIVING
#define CONFIG_LOCAL_GPIO_LED_LIVING -1
#endif
#ifndef CONFIG_LOCAL_GPIO_LED_BEDROOM
#define CONFIG_LOCAL_GPIO_LED_BEDROOM -1
#endif
#ifndef CONFIG_LOCAL_GPIO_LED_KITCHEN
#define CONFIG_LOCAL_GPIO_LED_KITCHEN -1
#endif
#ifndef CONFIG_LOCAL_GPIO_LED_HALLWAY
#define CONFIG_LOCAL_GPIO_LED_HALLWAY -1
#endif
#ifndef CONFIG_LOCAL_GPIO_DOOR_SERVO
#define CONFIG_LOCAL_GPIO_DOOR_SERVO -1
#endif
#ifndef CONFIG_LOCAL_GPIO_FAN_OUTPUT
#define CONFIG_LOCAL_GPIO_FAN_OUTPUT -1
#endif

namespace local_controller
{
    enum class GpioRole
    {
        sensor_input_1,
        light_relay_1,
        mq2_adc,
        dht11_data,
        led_living,
        led_bedroom,
        led_kitchen,
        led_hallway,
        door_servo,
        fan_output
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
        {GpioRole::light_relay_1, CONFIG_LOCAL_GPIO_LIGHT_RELAY_1},
        {GpioRole::mq2_adc, CONFIG_LOCAL_GPIO_MQ2_ADC},
        {GpioRole::dht11_data, CONFIG_LOCAL_GPIO_DHT11},
        {GpioRole::led_living, CONFIG_LOCAL_GPIO_LED_LIVING},
        {GpioRole::led_bedroom, CONFIG_LOCAL_GPIO_LED_BEDROOM},
        {GpioRole::led_kitchen, CONFIG_LOCAL_GPIO_LED_KITCHEN},
        {GpioRole::led_hallway, CONFIG_LOCAL_GPIO_LED_HALLWAY},
        {GpioRole::door_servo, CONFIG_LOCAL_GPIO_DOOR_SERVO},
        {GpioRole::fan_output, CONFIG_LOCAL_GPIO_FAN_OUTPUT}
    };

    constexpr bool is_esp32s3_gpio_number(int pin)
    {
        return (pin >= 0 && pin <= 21) || (pin >= 26 && pin <= 48);
    }

    constexpr bool is_esp32s3_adc1_gpio(int pin)
    {
        return pin >= 1 && pin <= 10;
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
            if (gpio_mappings[index].role == GpioRole::mq2_adc && !is_esp32s3_adc1_gpio(pin))
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
