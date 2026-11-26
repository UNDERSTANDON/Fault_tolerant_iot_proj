include("${CMAKE_CURRENT_LIST_DIR}/../validate_gpio_mapping.cmake")

validate_local_gpio_mapping(
    "${GPIO_TEST_TARGET}"
    "${GPIO_TEST_SENSOR_PIN}"
    "${GPIO_TEST_RELAY_PIN}"
)
