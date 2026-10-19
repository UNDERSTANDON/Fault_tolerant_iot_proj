idf_component_register(
     SRCS 
          "Fault_tolerant_iot_proj.cpp"
          "cloud_controller.cpp"
          "local_controller.cpp"
          "web_hoster.cpp"
          
     INCLUDE_DIRS 
          "."
          "cloud_controller"
          "local_controller"
          "web_hoster"
)
