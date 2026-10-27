/**
 * Initial Mock Data for Smart Home (3 Rooms + Hallway)
 * Compliant with UI_RULES.md - Articles 7, 9, 11 (English UI Exclusivity)
 */

export const INITIAL_ROOMS_DATA = [
  {
    id: 'hallway',
    name: 'Hallway & Entrance',
    description: 'Apartment main entrance & foyer',
    devices: [
      { id: 'hallway_light', name: 'Hallway Light', type: 'light', state: true, available: true },
      { id: 'door_nfc', name: 'NFC Door Lock', type: 'lock', state: 'LOCKED', available: true },
      { id: 'ups_backup', name: 'UPS Backup Power', type: 'ups', value: '100%', unit: 'Battery', available: true }
    ],
    sensors: []
  },
  {
    id: 'living_room',
    name: 'Living Room',
    description: 'Central hub & ESP32 AP Gateway',
    devices: [
      { id: 'living_light', name: 'Ceiling Light', type: 'light', state: true, available: true },
      { id: 'living_fan', name: 'Ventilation Fan', type: 'fan', state: false, available: true }
    ],
    sensors: [
      { id: 'living_temp', name: 'Ambient Temp', value: 28.4, unit: '°C', type: 'temperature' },
      { id: 'living_smoke', name: 'Smoke Detector', value: 'Clear', type: 'smoke', status: 'NORMAL' },
      { id: 'living_ap', name: 'ESP32 AP Gateway', value: 'Active', type: 'gateway', status: 'ONLINE' }
    ]
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    description: 'Cooking and dining area',
    devices: [
      { id: 'kitchen_light', name: 'Kitchen Light', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'kitchen_temp', name: 'Kitchen Temp', value: 29.8, unit: '°C', type: 'temperature' },
      { id: 'kitchen_humidity', name: 'Humidity', value: 65, unit: '%', type: 'humidity' },
      { id: 'kitchen_smoke', name: 'Smoke Detector', value: 'Clear', type: 'smoke', status: 'NORMAL' }
    ]
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'Sleeping and resting area',
    devices: [
      { id: 'bedroom_light', name: 'Bedroom Light', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'bedroom_temp', name: 'Bedroom Temp', value: 26.2, unit: '°C', type: 'temperature' },
      { id: 'bedroom_smoke', name: 'Smoke Detector', value: 'Clear', type: 'smoke', status: 'NORMAL' }
    ]
  }
];

export const NETWORK_MODES = {
  NORMAL: 'NORMAL',
  SWITCHING: 'SWITCHING',
  LOCAL: 'LOCAL',
  RECONNECTING: 'RECONNECTING',
  UNAVAILABLE: 'UNAVAILABLE'
};

export const INITIAL_NETWORK_STATE = {
  mode: NETWORK_MODES.NORMAL,
  internet: true,
  localLan: true,
  mqttBroker: true,
  latencyMs: 18,
  lastUpdated: new Date().toLocaleTimeString('en-US')
};
