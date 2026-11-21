/**
 * Initial Room, Sensor & Device Data for SafeHaven Smart Home (3 Rooms + Hallway)
 */

export const INITIAL_ROOMS_DATA = [
  {
    id: 'hallway',
    name: 'Hallway & Entrance',
    description: 'Apartment main entrance & foyer perimeter',
    devices: [
      { id: 'hallway_light', name: 'Hallway Light', model: 'Relay CH1', type: 'light', state: true, available: true },
      { id: 'door_nfc', name: 'NFC Door Lock', model: 'PN532 Latch', type: 'lock', state: 'LOCKED', available: true },
      { id: 'ups_backup', name: 'UPS Backup Power', model: 'LiFePO4 24h', type: 'ups', value: '100%', unit: 'Battery', available: true }
    ],
    sensors: [
      { id: 'hallway_nfc_sensor', name: 'Entrance NFC Reader', model: 'PN532', value: 'Armed', type: 'gateway', status: 'ONLINE', source: 'Simulator' },
      { id: 'hallway_smoke', name: 'Foyer Smoke Detector', model: 'MQ-2', value: 'Clear', type: 'smoke', status: 'NORMAL', source: 'Simulator' }
    ]
  },
  {
    id: 'living_room',
    name: 'Living Room',
    description: 'Central domestic hub & ESP32-S3 Edge Gateway',
    devices: [
      { id: 'living_light', name: 'Ceiling Light', model: 'Relay CH2', type: 'light', state: true, available: true },
      { id: 'living_fan', name: 'Ventilation Fan', model: 'Relay CH3', type: 'fan', state: false, available: true }
    ],
    sensors: [
      { id: 'living_temp', name: 'Ambient Temperature', model: 'DHT22', value: 28.4, unit: '°C', type: 'temperature', status: 'NORMAL', source: 'Simulator' },
      { id: 'living_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2', value: 'Clear', type: 'smoke', status: 'NORMAL', source: 'Simulator' },
      { id: 'living_ap', name: 'ESP32 Edge Gateway', model: 'ESP32-S3', value: 'Active', type: 'gateway', status: 'ONLINE', source: 'Simulator' }
    ]
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    description: 'Cooking, dining & high-priority fire monitoring zone',
    devices: [
      { id: 'kitchen_light', name: 'Kitchen Light', model: 'Relay CH4', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'kitchen_temp', name: 'Kitchen Temperature', model: 'DHT22', value: 29.8, unit: '°C', type: 'temperature', status: 'NORMAL', source: 'Simulator' },
      { id: 'kitchen_humidity', name: 'Relative Humidity', model: 'DHT22', value: 65, unit: '%', type: 'humidity', status: 'NORMAL', source: 'Simulator' },
      { id: 'kitchen_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2', value: 'Clear', type: 'smoke', status: 'NORMAL', source: 'Simulator' }
    ]
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'Sleeping quarters & nighttime environmental monitoring',
    devices: [
      { id: 'bedroom_light', name: 'Bedroom Light', model: 'Relay CH5', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'bedroom_temp', name: 'Bedroom Temperature', model: 'DHT22', value: 26.2, unit: '°C', type: 'temperature', status: 'NORMAL', source: 'Simulator' },
      { id: 'bedroom_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2', value: 'Clear', type: 'smoke', status: 'NORMAL', source: 'Simulator' }
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
