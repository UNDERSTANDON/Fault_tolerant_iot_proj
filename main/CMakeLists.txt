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
          "esp_http_server"
          "log"

     INCLUDE_DIRS
          "."
          "cloud_controller"
          "local_controller"
          "web_hoster"
)