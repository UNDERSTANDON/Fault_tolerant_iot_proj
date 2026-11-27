include("${CMAKE_CURRENT_LIST_DIR}/../validate_gpio_mapping.cmake")

validate_local_gpio_mapping(
    "${GPIO_TEST_TARGET}"
    "${GPIO_TEST_SENSOR_PIN}"
    "${GPIO_TEST_RELAY_PIN}"
)

if(DEFINED GPIO_TEST_MQ2_PIN)
    validate_hardware_gpio_bundle(
        "${GPIO_TEST_TARGET}"
        "${GPIO_TEST_MQ2_PIN}"
        "${GPIO_TEST_DHT11_PIN}"
        "${GPIO_TEST_LED_LIVING_PIN}"
        "${GPIO_TEST_LED_BEDROOM_PIN}"
        "${GPIO_TEST_LED_KITCHEN_PIN}"
        "${GPIO_TEST_LED_HALLWAY_PIN}"
        "${GPIO_TEST_DOOR_SERVO_PIN}"
        "${GPIO_TEST_FAN_PIN}"
    )
else()
    validate_hardware_gpio_bundle("esp32s3" "1" "4" "5" "6" "7" "21" "8" "9")
endif()
