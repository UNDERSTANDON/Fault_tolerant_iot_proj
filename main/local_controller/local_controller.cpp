#include "local_controller.h"

namespace local_controller
{
    NetworkState LocalController::state() const
    {
        return state_.load();
    }

    bool LocalController::station_connected() const
    {
        return station_connected_.load();
    }

    bool LocalController::fallback_ap_active() const
    {
        return fallback_ap_active_.load();
    }

    void LocalController::station_connecting()
    {
        if (!services_available_.load())
        {
            state_.store(NetworkState::unavailable);
        }
        else if (!station_connected_.load())
        {
            state_.store(fallback_ap_active_.load()
                             ? NetworkState::fallback_ap_reconnecting
                             : NetworkState::station_connecting);
        }
    }

    void LocalController::station_connected_event()
    {
        station_connected_.store(true);
        update_state();
    }

    void LocalController::station_disconnected()
    {
        station_connected_.store(false);
        update_state();
    }

    void LocalController::fallback_ap_started()
    {
        fallback_ap_active_.store(true);
        update_state();
    }

    void LocalController::fallback_ap_failed()
    {
        fallback_ap_active_.store(false);
        update_state();
    }

    void LocalController::services_unavailable()
    {
        services_available_.store(false);
        state_.store(NetworkState::unavailable);
    }

    const char *LocalController::state_name(NetworkState state)
    {
        switch (state)
        {
        case NetworkState::initializing:
            return "initializing";
        case NetworkState::station_connecting:
            return "station_connecting";
        case NetworkState::station_connected:
            return "station_connected";
        case NetworkState::fallback_ap_active:
            return "fallback_ap_active";
        case NetworkState::fallback_ap_reconnecting:
            return "fallback_ap_reconnecting";
        case NetworkState::station_ap_recovery:
            return "station_ap_recovery";
        case NetworkState::unavailable:
            return "unavailable";
        }
        return "unavailable";
    }

    void LocalController::update_state()
    {
        if (!services_available_.load())
        {
            state_.store(NetworkState::unavailable);
            return;
        }
        const bool station_connected = station_connected_.load();
        const bool fallback_ap_active = fallback_ap_active_.load();
        if (station_connected && fallback_ap_active)
        {
            state_.store(NetworkState::station_ap_recovery);
        }
        else if (station_connected)
        {
            state_.store(NetworkState::station_connected);
        }
        else if (fallback_ap_active)
        {
            state_.store(NetworkState::fallback_ap_active);
        }
        else
        {
            state_.store(NetworkState::unavailable);
        }
    }
}
