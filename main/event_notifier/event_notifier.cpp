#include "event_notifier.h"

namespace event_notifier
{
    EventNotifier::EventNotifier(NotificationSink &sink)
        : sink_(sink)
    {
    }

    bool EventNotifier::notify(const Notification &notification) const
    {
        if (notification.title == nullptr || notification.title[0] == '\0' ||
            notification.message == nullptr || notification.message[0] == '\0')
        {
            return false;
        }

        switch (notification.severity)
        {
        case Severity::warning:
            return sink_.notify_warning(notification);
        case Severity::critical:
            return sink_.notify_critical(notification);
        }
        return false;
    }
}
