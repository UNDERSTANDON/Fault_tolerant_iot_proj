#include "local_controller.h"

#include <cassert>

int main()
{
    local_controller::LocalController controller;
    assert(controller.state() == local_controller::NetworkState::initializing);

    controller.station_connecting();
    assert(controller.state() == local_controller::NetworkState::station_connecting);

    controller.station_connected_event();
    assert(controller.station_connected());
    assert(controller.state() == local_controller::NetworkState::station_connected);

    controller.station_disconnected();
    assert(!controller.station_connected());
    assert(controller.state() == local_controller::NetworkState::unavailable);

    controller.fallback_ap_started();
    assert(controller.fallback_ap_active());
    assert(controller.state() == local_controller::NetworkState::fallback_ap_active);

    controller.station_connecting();
    assert(controller.state() == local_controller::NetworkState::fallback_ap_reconnecting);

    controller.station_connected_event();
    assert(controller.state() == local_controller::NetworkState::station_ap_recovery);

    controller.station_disconnected();
    assert(controller.state() == local_controller::NetworkState::fallback_ap_active);

    controller.station_connecting();
    assert(controller.state() == local_controller::NetworkState::fallback_ap_reconnecting);

    controller.services_unavailable();
    controller.station_connected_event();
    assert(controller.state() == local_controller::NetworkState::unavailable);

    return 0;
}
