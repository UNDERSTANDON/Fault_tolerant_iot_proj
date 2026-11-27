# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.22)

# Ignore this err, VSCode can't find the IDF_PATH env var, but it does exist
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(Fault_tolerant_iot_proj)

include("${CMAKE_CURRENT_LIST_DIR}/main/validate_gpio_mapping.cmake")
validate_local_gpio_mapping(
    "${IDF_TARGET}"
    "${CONFIG_LOCAL_GPIO_SENSOR_INPUT_1}"
    "${CONFIG_LOCAL_GPIO_LIGHT_RELAY_1}"
)
validate_hardware_gpio_bundle(
    "${IDF_TARGET}"
    "${CONFIG_LOCAL_GPIO_MQ2_ADC}"
    "${CONFIG_LOCAL_GPIO_DHT11}"
    "${CONFIG_LOCAL_GPIO_LED_LIVING}"
    "${CONFIG_LOCAL_GPIO_LED_BEDROOM}"
    "${CONFIG_LOCAL_GPIO_LED_KITCHEN}"
    "${CONFIG_LOCAL_GPIO_LED_HALLWAY}"
    "${CONFIG_LOCAL_GPIO_DOOR_SERVO}"
    "${CONFIG_LOCAL_GPIO_FAN_OUTPUT}"
)
