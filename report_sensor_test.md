# Report

This is the code used in yesterday testing.
From the result, it appeared that the DHT11 is either broken
or wrong GPIO pin. Although we did check whether if that's
the case and we concluded it maybe broken.

As for the MQ2 sensor, we bought a brand new one a few day
prior to the test so we can confirm that it is working as
intented. Albeit, a bit to sensitive.

```C++
#include <math.h>
#include <stdio.h>
#include <stdint.h>

#include "driver/gpio.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "rom/ets_sys.h"

#define DHT_PIN GPIO_NUM_4
#define MQ2_ADC_UNIT ADC_UNIT_1
#define MQ2_ADC_CHANNEL ADC_CHANNEL_0

static const char *TAG = "DHT_MQ2";

static const float ADC_VREF = 3.3f;
static const int ADC_MAX = 4095;
static const float DIVIDER_RATIO = 1.0f;
static const int MQ2_ALERT_RAW = 2000;
static const uint32_t WARMUP_MS = 20000;
static const uint32_t READ_INTERVAL_MS = 2000;
static const int64_t DHT_TIMEOUT_US = 100000;

static int read_mq2_raw(adc_oneshot_unit_handle_t adc_handle) {
    int sum = 0;
    for (int i = 0; i < 10; ++i) {
        int raw = 0;
        if (adc_oneshot_read(adc_handle, MQ2_ADC_CHANNEL, &raw) == ESP_OK) {
            sum += raw;
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
    return sum / 10;
}

static bool dht_read(float *humidity, float *temperature) {
    if (humidity == NULL || temperature == NULL) {
        return false;
    }

    gpio_set_direction(DHT_PIN, GPIO_MODE_OUTPUT_OD);
    gpio_set_level(DHT_PIN, 0);
    vTaskDelay(pdMS_TO_TICKS(20));
    gpio_set_level(DHT_PIN, 1);
    ets_delay_us(40);
    gpio_set_direction(DHT_PIN, GPIO_MODE_INPUT);

    int64_t start = esp_timer_get_time();
    while (gpio_get_level(DHT_PIN) == 1 && (esp_timer_get_time() - start) < DHT_TIMEOUT_US) {
    }
    if ((esp_timer_get_time() - start) >= DHT_TIMEOUT_US) {
        return false;
    }

    start = esp_timer_get_time();
    while (gpio_get_level(DHT_PIN) == 0 && (esp_timer_get_time() - start) < DHT_TIMEOUT_US) {
    }
    if ((esp_timer_get_time() - start) >= DHT_TIMEOUT_US) {
        return false;
    }

    uint8_t data[5] = {0};
    int bit_index = 0;

    for (int i = 0; i < 40; ++i) {
        start = esp_timer_get_time();
        while (gpio_get_level(DHT_PIN) == 0 && (esp_timer_get_time() - start) < DHT_TIMEOUT_US) {
        }

        int64_t low_start = esp_timer_get_time();
        while (gpio_get_level(DHT_PIN) == 1 && (esp_timer_get_time() - low_start) < DHT_TIMEOUT_US) {
        }

        int64_t pulse_us = esp_timer_get_time() - low_start;
        data[bit_index / 8] <<= 1;
        if (pulse_us > 40) {
            data[bit_index / 8] |= 1;
        }
        bit_index++;
    }

    uint8_t checksum = data[0] + data[1] + data[2] + data[3];
    if (data[4] != checksum) {
        return false;
    }

    *humidity = (float)data[0] + ((float)data[1] / 10.0f);
    *temperature = (float)data[2] + ((float)data[3] / 10.0f);
    return true;
}

extern "C" void app_main(void) {
    gpio_reset_pin(DHT_PIN);
    gpio_set_direction(DHT_PIN, GPIO_MODE_INPUT);
    gpio_pullup_en(DHT_PIN);

    adc_oneshot_unit_handle_t adc_handle = NULL;
    adc_oneshot_unit_init_cfg_t adc_config = {
        .unit_id = MQ2_ADC_UNIT,
        .clk_src = ADC_RTC_CLK_SRC_DEFAULT,
        .ulp_mode = ADC_ULP_MODE_DISABLE,
    };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&adc_config, &adc_handle));

    adc_oneshot_chan_cfg_t adc_channel_config = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, MQ2_ADC_CHANNEL, &adc_channel_config));

    ESP_LOGI(TAG, "=== TEST DHT + MQ-2 (ESP32-S3) ===");
    ESP_LOGI(TAG, "MQ-2 warm-up: %lu seconds...", (unsigned long)(WARMUP_MS / 1000));

    uint64_t last_read_ms = 0;
    while (1) {
        uint64_t now_ms = esp_timer_get_time() / 1000ULL;
        if ((now_ms - last_read_ms) < READ_INTERVAL_MS) {
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }
        last_read_ms = now_ms;

        float humidity = 0.0f;
        float temperature = 0.0f;

        ESP_LOGI(TAG, "--------------------------------");
        // We ran to this if instead. Currently, we are
        // ordering a new one to make sure that the code is 
        // working as intented.
        if (!dht_read(&humidity, &temperature)) {
            ESP_LOGE(TAG, "[DHT] Failed to read sensor. Check wiring on GPIO%d and DHT type.", DHT_PIN);
        } else {
            ESP_LOGI(TAG, "[DHT] Temperature: %.1f C | Humidity: %.1f %%", temperature, humidity);
        }

        int raw = read_mq2_raw(adc_handle);
        float v_adc = (float)raw * ADC_VREF / (float)ADC_MAX;
        float v_sensor = v_adc * DIVIDER_RATIO;
        int percent = (raw * 100) / ADC_MAX;

        ESP_LOGI(TAG, "[MQ2] ADC raw: %d | V_adc: %.2f V | V_AO: %.2f V | %d %%",
                 raw, v_adc, v_sensor, percent);

        // We ran into all of the cases.
        if (now_ms < WARMUP_MS) {
            ESP_LOGW(TAG, "[MQ2] Warm-up in progress; readings may be unstable.");
        } else if (raw > MQ2_ALERT_RAW) {
            ESP_LOGE(TAG, "[MQ2] !!! GAS/SMOKE ALERT DETECTED !!!");
        } else {
            ESP_LOGI(TAG, "[MQ2] Normal condition");
        }
    }
}
```

In conclusion, the sensor test passed 50%, while the other 50% failed was due to broken sensor.
