# When adding files, remember to add them to the idf_component_register() function below, otherwise they will not be compiled into the project. 
# Only adding cpp files, the web related files are stored in firmware image and are not compiled into the project. 
idf_component_register(
     SRCS
          "Fault_tolerant_iot_proj.cpp"
          "cloud_controller/cloud_controller.cpp"
          "local_controller/local_controller.cpp"
          "web_hoster/web_hoster.cpp"

     PRIV_REQUIRES 
          "esp_wifi"
          "esp_netif"
          "esp_event"
          "nvs_flash"
          "esp_http_server"
          "log"
          "cjson"
          "mdns"

     EMBED_TXTFILES
          "web_hoster/wifi_config.json"
          "web_hoster/web/index.html"
          "web_hoster/web/style.css"
          "web_hoster/web/app.js"

     INCLUDE_DIRS
          "."
          "cloud_controller"
          "local_controller"
          "web_hoster"
)