#include "hardware_controller.h"

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "cJSON.h"
#include "sdkconfig.h"
#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"
#include "esp_rom_sys.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "gpio_mapping.h"

namespace
{
    constexpr char TAG[] = "hw_controller";

    constexpr ledc_mode_t SERVO_LEDC_MODE = LEDC_LOW_SPEED_MODE;
    constexpr ledc_timer_t SERVO_LEDC_TIMER = LEDC_TIMER_0;
    constexpr ledc_channel_t SERVO_LEDC_CHANNEL = LEDC_CHANNEL_0;
    constexpr ledc_timer_bit_t SERVO_LEDC_DUTY_RES = LEDC_TIMER_14_BIT;
    constexpr uint32_t SERVO_LEDC_FREQ_HZ = 50;
    constexpr uint32_t SERVO_PERIOD_US = 20000;
    constexpr uint32_t SERVO_LOCKED_PULSE_US = 500;   // 0 degrees
    constexpr uint32_t SERVO_UNLOCKED_PULSE_US = 1500; // 90 degrees

    constexpr int MQ2_ADC_SAMPLES = 16;
    constexpr uint32_t POLL_INTERVAL_MS = 2500;
    constexpr int MQ2_MIN_MV = 250;
    constexpr int MQ2_FULL_SCALE_MV = 3100;

    SemaphoreHandle_t state_mutex = nullptr;
    portMUX_TYPE dht_spinlock = portMUX_INITIALIZER_UNLOCKED;
    adc_oneshot_unit_handle_t mq2_adc_handle = nullptr;
    adc_channel_t mq2_adc_channel = ADC_CHANNEL_0;
    bool mq2_adc_ready = false;
    bool initialized = false;
    bool poll_task_started = false;
    bool servo_ready = false;

    hardware_controller::HardwareSnapshot current_state = {};

    bool parse_target_active(const char *target_state, bool is_lock, bool &active_out)
    {
        if (target_state == nullptr)
        {
            return false;
        }
        if (std::strcmp(target_state, "ON") == 0 ||
            std::strcmp(target_state, "on") == 0 ||
            std::strcmp(target_state, "true") == 0 ||
            std::strcmp(target_state, "1") == 0 ||
            (is_lock && (std::strcmp(target_state, "UNLOCKED") == 0 ||
                         std::strcmp(target_state, "unlocked") == 0)))
        {
            active_out = true;
            return true;
        }
        if (std::strcmp(target_state, "OFF") == 0 ||
            std::strcmp(target_state, "off") == 0 ||
            std::strcmp(target_state, "false") == 0 ||
            std::strcmp(target_state, "0") == 0 ||
            (is_lock && (std::strcmp(target_state, "LOCKED") == 0 ||
                         std::strcmp(target_state, "locked") == 0)))
        {
            active_out = false;
            return true;
        }
        return false;
    }

    uint32_t servo_pulse_to_duty(uint32_t pulse_us)
    {
        constexpr uint32_t max_duty = (1U << 14);
        return (pulse_us * max_duty) / SERVO_PERIOD_US;
    }

    bool set_servo_angle(bool unlocked)
    {
        if (!servo_ready || CONFIG_LOCAL_GPIO_DOOR_SERVO < 0)
        {
            return false;
        }
        const uint32_t pulse_us = unlocked ? SERVO_UNLOCKED_PULSE_US : SERVO_LOCKED_PULSE_US;
        const uint32_t duty = servo_pulse_to_duty(pulse_us);
        if (ledc_set_duty(SERVO_LEDC_MODE, SERVO_LEDC_CHANNEL, duty) != ESP_OK)
        {
            return false;
        }
        return ledc_update_duty(SERVO_LEDC_MODE, SERVO_LEDC_CHANNEL) == ESP_OK;
    }

    bool write_digital_output(int pin, bool active, bool active_low)
    {
        if (pin < 0)
        {
            return false;
        }
        const int level = active_low ? (active ? 0 : 1) : (active ? 1 : 0);
        return gpio_set_level(static_cast<gpio_num_t>(pin), level) == ESP_OK;
    }

    void configure_output_pin(int pin, bool initial_active, bool active_low)
    {
        if (pin < 0)
        {
            return;
        }
        const gpio_num_t gpio = static_cast<gpio_num_t>(pin);
        gpio_config_t io_conf = {};
        io_conf.intr_type = GPIO_INTR_DISABLE;
        io_conf.mode = GPIO_MODE_INPUT_OUTPUT;
        io_conf.pin_bit_mask = (1ULL << pin);
        io_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
        io_conf.pull_up_en = GPIO_PULLUP_DISABLE;
        gpio_config(&io_conf);
        const int initial_level = active_low ? (initial_active ? 0 : 1) : (initial_active ? 1 : 0);
        gpio_set_level(gpio, initial_level);
    }

    bool map_esp32s3_adc1_channel(int gpio_pin, adc_channel_t &channel_out)
    {
        if (gpio_pin < 1 || gpio_pin > 10)
        {
            return false;
        }
        channel_out = static_cast<adc_channel_t>(gpio_pin - 1);
        return true;
    }

    int wait_gpio_level_us(gpio_num_t pin, int target_level, int timeout_us)
    {
        int elapsed = 0;
        while (gpio_get_level(pin) == target_level)
        {
            if (elapsed >= timeout_us)
            {
                return -1;
            }
            esp_rom_delay_us(1);
            ++elapsed;
        }
        return elapsed;
    }

    bool read_dht11_once(int gpio_pin, float &temp_c_out, float &humidity_pct_out)
    {
        if (gpio_pin < 0)
        {
            return false;
        }

        const gpio_num_t pin = static_cast<gpio_num_t>(gpio_pin);
        uint8_t data[5] = {};

        // Host start signal: pull low >= 18ms, then release high 20-40us
        gpio_set_level(pin, 0);
        esp_rom_delay_us(20000);

        portENTER_CRITICAL(&dht_spinlock);
        gpio_set_level(pin, 1);
        esp_rom_delay_us(30);

        // Sensor response: 80us low followed by 80us high
        if (wait_gpio_level_us(pin, 1, 90) < 0 ||
            wait_gpio_level_us(pin, 0, 100) < 0 ||
            wait_gpio_level_us(pin, 1, 100) < 0)
        {
            portEXIT_CRITICAL(&dht_spinlock);
            return false;
        }

        for (int bit = 0; bit < 40; ++bit)
        {
            if (wait_gpio_level_us(pin, 0, 75) < 0)
            {
                portEXIT_CRITICAL(&dht_spinlock);
                return false;
            }
            const int high_us = wait_gpio_level_us(pin, 1, 100);
            if (high_us < 0)
            {
                portEXIT_CRITICAL(&dht_spinlock);
                return false;
            }
            data[bit / 8] <<= 1;
            if (high_us > 40)
            {
                data[bit / 8] |= 1U;
            }
        }
        portEXIT_CRITICAL(&dht_spinlock);

        const uint8_t checksum = static_cast<uint8_t>(data[0] + data[1] + data[2] + data[3]);
        if (checksum != data[4])
        {
            return false;
        }

        const float humidity = static_cast<float>(data[0]) + static_cast<float>(data[1]) * 0.1f;
        const float temp = static_cast<float>(data[2]) + static_cast<float>(data[3]) * 0.1f;
        if (humidity < 5.0f || humidity > 99.0f || temp < -10.0f || temp > 65.0f)
        {
            return false;
        }

        humidity_pct_out = humidity;
        temp_c_out = temp;
        return true;
    }

    void sample_mq2(bool &valid_out, int &pin_mv_out, int &scaled_mv_out,
                    int &percent_out, bool &preheating_out, bool &alert_out, bool prev_alert)
    {
        const uint64_t uptime_sec = static_cast<uint64_t>(esp_timer_get_time() / 1000000ULL);
        preheating_out = uptime_sec < static_cast<uint64_t>(CONFIG_LOCAL_MQ2_PREHEAT_SECONDS);

        if (!mq2_adc_ready || mq2_adc_handle == nullptr)
        {
            valid_out = false;
            pin_mv_out = 0;
            scaled_mv_out = 0;
            percent_out = 0;
            alert_out = false;
            return;
        }

        int raw_sum = 0;
        int ok_count = 0;
        for (int i = 0; i < MQ2_ADC_SAMPLES; ++i)
        {
            int raw = 0;
            if (adc_oneshot_read(mq2_adc_handle, mq2_adc_channel, &raw) == ESP_OK)
            {
                raw_sum += raw;
                ++ok_count;
            }
        }

        if (ok_count == 0)
        {
            valid_out = false;
            alert_out = prev_alert;
            return;
        }

        const int avg_raw = raw_sum / ok_count;
        const int pin_mv = (avg_raw * MQ2_FULL_SCALE_MV) / 4095;
        const int scaled_mv = (pin_mv * CONFIG_LOCAL_MQ2_DIVIDER_X100) / 100;
        const int span = std::max(100, CONFIG_LOCAL_MQ2_ALERT_MV - MQ2_MIN_MV);
        const int pct = std::clamp(((pin_mv - MQ2_MIN_MV) * 100) / span, 0, 100);

        valid_out = true;
        pin_mv_out = pin_mv;
        scaled_mv_out = scaled_mv;
        percent_out = pct;

        if (preheating_out)
        {
            alert_out = false;
            return;
        }

        const int clear_threshold_mv = (CONFIG_LOCAL_MQ2_ALERT_MV * 85) / 100;
        if (pin_mv >= CONFIG_LOCAL_MQ2_ALERT_MV)
        {
            alert_out = true;
        }
        else if (prev_alert && pin_mv > clear_threshold_mv)
        {
            alert_out = true;
        }
        else
        {
            alert_out = false;
        }
    }

    void polling_task(void *)
    {
        for (;;)
        {
            float temp_c = 0.0f;
            float humidity_pct = 0.0f;
            const bool dht_ok = read_dht11_once(CONFIG_LOCAL_GPIO_DHT11, temp_c, humidity_pct);

            bool mq2_ok = false;
            int pin_mv = 0;
            int scaled_mv = 0;
            int mq2_pct = 0;
            bool preheating = false;
            bool prev_alert = false;
            bool next_alert = false;

            if (xSemaphoreTake(state_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
            {
                prev_alert = current_state.smoke_alert;
                xSemaphoreGive(state_mutex);
            }

            sample_mq2(mq2_ok, pin_mv, scaled_mv, mq2_pct, preheating, next_alert, prev_alert);

            if (xSemaphoreTake(state_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
            {
                const uint64_t now_ms = static_cast<uint64_t>(esp_timer_get_time() / 1000ULL);
                current_state.uptime_ms = now_ms;
                if (dht_ok)
                {
                    current_state.dht_valid = true;
                    current_state.temperature_c = temp_c;
                    current_state.humidity_pct = humidity_pct;
                    current_state.dht_last_ok_ms = now_ms;
                }
                else if (current_state.dht_last_ok_ms > 0 &&
                         (now_ms - current_state.dht_last_ok_ms) > 15000ULL)
                {
                    current_state.dht_valid = false;
                }

                current_state.mq2_valid = mq2_ok;
                current_state.mq2_preheating = preheating;
                current_state.smoke_alert = next_alert;
                if (mq2_ok)
                {
                    current_state.mq2_pin_mv = pin_mv;
                    current_state.mq2_scaled_mv = scaled_mv;
                    current_state.mq2_percent = mq2_pct;
                }
                xSemaphoreGive(state_mutex);
            }

            vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL_MS));
        }
    }
}

namespace hardware_controller
{
    bool init()
    {
        if (initialized)
        {
            return true;
        }
        if (local_controller::validate_gpio_mappings() != local_controller::GpioMappingStatus::valid)
        {
            ESP_LOGE(TAG, "Hardware init aborted: invalid or conflicting GPIO mapping");
            return false;
        }

        state_mutex = xSemaphoreCreateMutex();
        if (state_mutex == nullptr)
        {
            ESP_LOGE(TAG, "Could not create hardware state mutex");
            return false;
        }

        current_state = {};
#if CONFIG_LOCAL_HARDWARE_ENABLE
        current_state.hardware_enabled = true;

        // 1. Configure 4 LEDs (Active-HIGH) and standby Fan
        configure_output_pin(CONFIG_LOCAL_GPIO_LED_LIVING, false, false);
        configure_output_pin(CONFIG_LOCAL_GPIO_LED_BEDROOM, false, false);
        configure_output_pin(CONFIG_LOCAL_GPIO_LED_KITCHEN, false, false);
        configure_output_pin(CONFIG_LOCAL_GPIO_LED_HALLWAY, false, false);
#if CONFIG_LOCAL_FAN_ACTIVE_LOW
        configure_output_pin(CONFIG_LOCAL_GPIO_FAN_OUTPUT, false, true);
#else
        configure_output_pin(CONFIG_LOCAL_GPIO_FAN_OUTPUT, false, false);
#endif

        // 2. Configure DHT11 open-drain bidirectional 1-wire pin
        if (CONFIG_LOCAL_GPIO_DHT11 >= 0)
        {
            const gpio_num_t dht_gpio = static_cast<gpio_num_t>(CONFIG_LOCAL_GPIO_DHT11);
            gpio_config_t dht_conf = {};
            dht_conf.intr_type = GPIO_INTR_DISABLE;
            dht_conf.mode = GPIO_MODE_INPUT_OUTPUT_OD;
            dht_conf.pin_bit_mask = (1ULL << CONFIG_LOCAL_GPIO_DHT11);
            dht_conf.pull_up_en = GPIO_PULLUP_ENABLE;
            dht_conf.pull_down_en = GPIO_PULLDOWN_DISABLE;
            gpio_config(&dht_conf);
            gpio_set_level(dht_gpio, 1);
        }

        // 3. Configure Door Servo LEDC 50Hz PWM
        if (CONFIG_LOCAL_GPIO_DOOR_SERVO >= 0)
        {
            ledc_timer_config_t timer_conf = {};
            timer_conf.speed_mode = SERVO_LEDC_MODE;
            timer_conf.timer_num = SERVO_LEDC_TIMER;
            timer_conf.duty_resolution = SERVO_LEDC_DUTY_RES;
            timer_conf.freq_hz = SERVO_LEDC_FREQ_HZ;
            timer_conf.clk_cfg = LEDC_AUTO_CLK;
            if (ledc_timer_config(&timer_conf) == ESP_OK)
            {
                ledc_channel_config_t ch_conf = {};
                ch_conf.speed_mode = SERVO_LEDC_MODE;
                ch_conf.channel = SERVO_LEDC_CHANNEL;
                ch_conf.timer_sel = SERVO_LEDC_TIMER;
                ch_conf.intr_type = LEDC_INTR_DISABLE;
                ch_conf.gpio_num = CONFIG_LOCAL_GPIO_DOOR_SERVO;
                ch_conf.duty = servo_pulse_to_duty(SERVO_LOCKED_PULSE_US);
                ch_conf.hpoint = 0;
                if (ledc_channel_config(&ch_conf) == ESP_OK)
                {
                    servo_ready = true;
                }
            }
            if (!servo_ready)
            {
                ESP_LOGW(TAG, "Door servo LEDC initialization failed on GPIO %d",
                         CONFIG_LOCAL_GPIO_DOOR_SERVO);
            }
        }

        // 4. Configure MQ-2 ADC1 oneshot reader
        if (CONFIG_LOCAL_GPIO_MQ2_ADC >= 0 &&
            map_esp32s3_adc1_channel(CONFIG_LOCAL_GPIO_MQ2_ADC, mq2_adc_channel))
        {
            adc_oneshot_unit_init_cfg_t unit_cfg = {};
            unit_cfg.unit_id = ADC_UNIT_1;
            if (adc_oneshot_new_unit(&unit_cfg, &mq2_adc_handle) == ESP_OK)
            {
                adc_oneshot_chan_cfg_t chan_cfg = {};
                chan_cfg.bitwidth = ADC_BITWIDTH_DEFAULT;
                chan_cfg.atten = ADC_ATTEN_DB_12;
                if (adc_oneshot_config_channel(mq2_adc_handle, mq2_adc_channel, &chan_cfg) == ESP_OK)
                {
                    mq2_adc_ready = true;
                }
            }
            if (!mq2_adc_ready)
            {
                ESP_LOGW(TAG, "MQ-2 ADC initialization failed on GPIO %d", CONFIG_LOCAL_GPIO_MQ2_ADC);
            }
        }

        ESP_LOGI(TAG, "Hardware initialized (DHT11=%d, MQ2=%d, LEDs=%d/%d/%d/%d, Servo=%d, Fan=%d)",
                 CONFIG_LOCAL_GPIO_DHT11, CONFIG_LOCAL_GPIO_MQ2_ADC,
                 CONFIG_LOCAL_GPIO_LED_LIVING, CONFIG_LOCAL_GPIO_LED_BEDROOM,
                 CONFIG_LOCAL_GPIO_LED_KITCHEN, CONFIG_LOCAL_GPIO_LED_HALLWAY,
                 CONFIG_LOCAL_GPIO_DOOR_SERVO, CONFIG_LOCAL_GPIO_FAN_OUTPUT);
#else
        current_state.hardware_enabled = false;
        ESP_LOGI(TAG, "Real hardware drivers disabled by Kconfig (CONFIG_LOCAL_HARDWARE_ENABLE=n)");
#endif

        initialized = true;
        return true;
    }

    bool start_polling_task()
    {
        if (!initialized && !init())
        {
            return false;
        }
#if !CONFIG_LOCAL_HARDWARE_ENABLE
        return true;
#else
        if (poll_task_started)
        {
            return true;
        }
        if (xTaskCreate(polling_task, "hw_sensor_poll", 4096, nullptr, 4, nullptr) != pdPASS)
        {
            ESP_LOGE(TAG, "Could not start hardware sensor polling task");
            return false;
        }
        poll_task_started = true;
        return true;
#endif
    }

    bool get_snapshot(HardwareSnapshot &out)
    {
        if (!initialized || state_mutex == nullptr)
        {
            out = {};
            return false;
        }
        if (xSemaphoreTake(state_mutex, pdMS_TO_TICKS(100)) != pdTRUE)
        {
            return false;
        }
        current_state.uptime_ms = static_cast<uint64_t>(esp_timer_get_time() / 1000ULL);
        out = current_state;
        xSemaphoreGive(state_mutex);
        return true;
    }

    bool resolve_device_metadata(const char *device_id, CommandResult &out)
    {
        out = {};
        if (device_id == nullptr)
        {
            out.error_message = "Missing deviceId";
            return false;
        }
        if (std::strcmp(device_id, "living_light") == 0)
        {
            out.device_id = "living_light";
            out.zone_id = "living_room";
            out.device_type = "light";
            out.gpio_pin = CONFIG_LOCAL_GPIO_LED_LIVING;
            return true;
        }
        if (std::strcmp(device_id, "bedroom_light") == 0)
        {
            out.device_id = "bedroom_light";
            out.zone_id = "bedroom";
            out.device_type = "light";
            out.gpio_pin = CONFIG_LOCAL_GPIO_LED_BEDROOM;
            return true;
        }
        if (std::strcmp(device_id, "kitchen_light") == 0)
        {
            out.device_id = "kitchen_light";
            out.zone_id = "kitchen";
            out.device_type = "light";
            out.gpio_pin = CONFIG_LOCAL_GPIO_LED_KITCHEN;
            return true;
        }
        if (std::strcmp(device_id, "hallway_light") == 0)
        {
            out.device_id = "hallway_light";
            out.zone_id = "hallway";
            out.device_type = "light";
            out.gpio_pin = CONFIG_LOCAL_GPIO_LED_HALLWAY;
            return true;
        }
        if (std::strcmp(device_id, "door_nfc") == 0)
        {
            out.device_id = "door_nfc";
            out.zone_id = "hallway";
            out.device_type = "lock";
            out.is_lock = true;
            out.gpio_pin = CONFIG_LOCAL_GPIO_DOOR_SERVO;
            return true;
        }
        if (std::strcmp(device_id, "living_fan") == 0)
        {
            out.device_id = "living_fan";
            out.zone_id = "living_room";
            out.device_type = "fan";
            out.gpio_pin = CONFIG_LOCAL_GPIO_FAN_OUTPUT;
            return true;
        }
        out.error_message = "Unknown deviceId";
        return false;
    }

    bool execute_device_command(const char *device_id, const char *target_state, CommandResult &out)
    {
        if (!resolve_device_metadata(device_id, out))
        {
            return false;
        }
        if (!initialized && !init())
        {
            out.error_message = "Hardware controller not initialized";
            return false;
        }

        bool active = false;
        if (!parse_target_active(target_state, out.is_lock, active))
        {
            out.error_message = "Invalid targetState";
            return false;
        }
        if (out.gpio_pin < 0)
        {
            out.error_message = "GPIO pin unassigned";
            return false;
        }

#if CONFIG_LOCAL_HARDWARE_ENABLE
        bool applied = false;
        if (out.is_lock)
        {
            applied = set_servo_angle(active);
        }
        else if (std::strcmp(out.device_id, "living_fan") == 0)
        {
#if CONFIG_LOCAL_FAN_ACTIVE_LOW
            applied = write_digital_output(out.gpio_pin, active, true);
#else
            applied = write_digital_output(out.gpio_pin, active, false);
#endif
        }
        else
        {
            applied = write_digital_output(out.gpio_pin, active, false);
        }

        if (!applied)
        {
            out.error_message = "Failed to drive GPIO/PWM hardware";
            return false;
        }
#endif

        if (xSemaphoreTake(state_mutex, pdMS_TO_TICKS(100)) == pdTRUE)
        {
            if (std::strcmp(out.device_id, "living_light") == 0)
            {
                current_state.living_light_on = active;
            }
            else if (std::strcmp(out.device_id, "bedroom_light") == 0)
            {
                current_state.bedroom_light_on = active;
            }
            else if (std::strcmp(out.device_id, "kitchen_light") == 0)
            {
                current_state.kitchen_light_on = active;
            }
            else if (std::strcmp(out.device_id, "hallway_light") == 0)
            {
                current_state.hallway_light_on = active;
            }
            else if (std::strcmp(out.device_id, "door_nfc") == 0)
            {
                current_state.door_unlocked = active;
            }
            else if (std::strcmp(out.device_id, "living_fan") == 0)
            {
                current_state.fan_on = active;
            }
            xSemaphoreGive(state_mutex);
        }

        out.accepted = true;
        out.state_active = active;
        out.state_label = out.is_lock ? (active ? "UNLOCKED" : "LOCKED") : (active ? "ON" : "OFF");
        return true;
    }

    bool format_snapshot_json(const HardwareSnapshot &snap, const char *device_id,
                              char *out_buf, std::size_t out_size)
    {
        if (out_buf == nullptr || out_size == 0)
        {
            return false;
        }
        cJSON *root = cJSON_CreateObject();
        cJSON *dht11 = cJSON_CreateObject();
        cJSON *mq2 = cJSON_CreateObject();
        cJSON *devices = cJSON_CreateObject();
        if (!root || !dht11 || !mq2 || !devices)
        {
            cJSON_Delete(root);
            cJSON_Delete(dht11);
            cJSON_Delete(mq2);
            cJSON_Delete(devices);
            return false;
        }

        cJSON_AddNumberToObject(root, "schema_version", 1);
        cJSON_AddStringToObject(root, "source", snap.hardware_enabled ? "Hardware" : "Disabled");
        cJSON_AddStringToObject(root, "device_id", device_id ? device_id : "esp32-s3");
        cJSON_AddNumberToObject(root, "uptimeMs", static_cast<double>(snap.uptime_ms));

        cJSON_AddBoolToObject(dht11, "valid", snap.dht_valid);
        cJSON_AddNumberToObject(dht11, "temperature",
                                static_cast<double>(static_cast<int>(snap.temperature_c * 10.0f + 0.5f)) / 10.0);
        cJSON_AddNumberToObject(dht11, "humidity",
                                static_cast<double>(static_cast<int>(snap.humidity_pct * 10.0f + 0.5f)) / 10.0);
        cJSON_AddNumberToObject(dht11, "pin", CONFIG_LOCAL_GPIO_DHT11);
        cJSON_AddItemToObject(root, "dht11", dht11);

        cJSON_AddBoolToObject(mq2, "valid", snap.mq2_valid);
        cJSON_AddBoolToObject(mq2, "preheating", snap.mq2_preheating);
        cJSON_AddStringToObject(mq2, "smoke", snap.smoke_alert ? "ALERT" : "NORMAL");
        cJSON_AddNumberToObject(mq2, "rawMv", snap.mq2_pin_mv);
        cJSON_AddNumberToObject(mq2, "scaledMv", snap.mq2_scaled_mv);
        cJSON_AddNumberToObject(mq2, "smokePercent", snap.mq2_percent);
        cJSON_AddNumberToObject(mq2, "pin", CONFIG_LOCAL_GPIO_MQ2_ADC);
        cJSON_AddItemToObject(root, "mq2", mq2);

        cJSON_AddBoolToObject(devices, "living_light", snap.living_light_on);
        cJSON_AddBoolToObject(devices, "bedroom_light", snap.bedroom_light_on);
        cJSON_AddBoolToObject(devices, "kitchen_light", snap.kitchen_light_on);
        cJSON_AddBoolToObject(devices, "hallway_light", snap.hallway_light_on);
        cJSON_AddStringToObject(devices, "door_nfc", snap.door_unlocked ? "UNLOCKED" : "LOCKED");
        cJSON_AddBoolToObject(devices, "living_fan", snap.fan_on);
        cJSON_AddItemToObject(root, "devices", devices);

        const bool ok = cJSON_PrintPreallocated(root, out_buf, static_cast<int>(out_size), false);
        cJSON_Delete(root);
        return ok;
    }

    bool format_command_ack_json(const char *command_id, const CommandResult &res,
                                 uint64_t timestamp_ms, char *out_buf, std::size_t out_size)
    {
        if (out_buf == nullptr || out_size == 0)
        {
            return false;
        }
        cJSON *ack = cJSON_CreateObject();
        if (!ack)
        {
            return false;
        }
        cJSON_AddStringToObject(ack, "commandId", (command_id && command_id[0]) ? command_id : "cmd-local");
        cJSON_AddStringToObject(ack, "deviceId", res.device_id ? res.device_id : "unknown");
        cJSON_AddStringToObject(ack, "zoneId", res.zone_id ? res.zone_id : "unknown");
        cJSON_AddStringToObject(ack, "state", res.state_label ? res.state_label : "OFF");
        cJSON_AddStringToObject(ack, "status", res.accepted ? "SUCCESS" : "FAILED");
        cJSON_AddNumberToObject(ack, "hardwarePin", res.gpio_pin);
        cJSON_AddStringToObject(ack, "source", "Hardware");
        cJSON_AddNumberToObject(ack, "timestampMs", static_cast<double>(timestamp_ms));
        if (!res.accepted && res.error_message)
        {
            cJSON_AddStringToObject(ack, "error", res.error_message);
        }
        const bool ok = cJSON_PrintPreallocated(ack, out_buf, static_cast<int>(out_size), false);
        cJSON_Delete(ack);
        return ok;
    }
}
