# When adding files, remember to add them to the idf_component_register() function below, otherwise they will not be compiled into the project. 
# Only adding cpp files, the web related files are stored in firmware image and are not compiled into the project. 
set(MQTT_CONNECTIVITY_EMBEDDED_CERTS)
if(CONFIG_CONNECTIVITY_MQTT_USE_CUSTOM_CA)
     set(MQTT_CONNECTIVITY_CA_FILE "${CMAKE_CURRENT_LIST_DIR}/mqtt_connectivity/broker_ca.pem")
     if(NOT EXISTS "${MQTT_CONNECTIVITY_CA_FILE}")
          message(FATAL_ERROR "Custom MQTT CA is enabled, but mqtt_connectivity/broker_ca.pem is missing")
     endif()
     list(APPEND MQTT_CONNECTIVITY_EMBEDDED_CERTS "mqtt_connectivity/broker_ca.pem")
endif()

idf_component_register(
     SRCS
          "Fault_tolerant_iot_proj.cpp"
          "cloud_controller/cloud_controller.cpp"
          "local_controller/local_controller.cpp"
          "mqtt_connectivity/mqtt_connectivity.cpp"
          "web_hoster/web_hoster.cpp"

     PRIV_REQUIRES 
          "esp_wifi"
          "esp_netif"
          "esp_event"
          "nvs_flash"
          "esp_http_server"
          "esp-tls"
          "log"
          "cjson"
          "mdns"
          "mqtt"

     EMBED_TXTFILES
          "web_hoster/web/index.html"
          "web_hoster/web/style.css"
          "web_hoster/web/app.js"
          ${MQTT_CONNECTIVITY_EMBEDDED_CERTS}

     INCLUDE_DIRS
          "."
          "cloud_controller"
          "local_controller"
          "mqtt_connectivity"
          "web_hoster"
)