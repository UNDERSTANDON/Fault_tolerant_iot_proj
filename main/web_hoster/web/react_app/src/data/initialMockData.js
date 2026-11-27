/**
 * Initial Room, Sensor & Device Data for SafeHaven Smart Home (3 Rooms + Hallway)
 */

export const INITIAL_ROOMS_DATA = [
  {
    id: 'hallway',
    name: 'Hallway & Entrance',
    description: 'Apartment main entrance & foyer perimeter',
    devices: [
      { id: 'hallway_light', name: 'Hallway Light', model: 'LED · GPIO21', type: 'light', state: false, available: true },
      { id: 'door_nfc', name: 'Smart Door Servo', model: 'Servo SG90 · GPIO8', type: 'lock', state: 'LOCKED', available: true }
    ],
    sensors: [
      { id: 'hallway_temp', name: 'Hallway Temperature', model: 'DHT11 · GPIO4', value: 'No Data', unit: '°C', type: 'temperature', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'hallway_smoke', name: 'Foyer Smoke Detector', model: 'MQ-2 · GPIO1', value: 'No Data', type: 'smoke', status: 'NO DATA', source: 'No Data (ESP32-S3)' }
    ]
  },
  {
    id: 'living_room',
    name: 'Living Room',
    description: 'Central domestic hub & ESP32-S3 Edge Gateway',
    devices: [
      { id: 'living_light', name: 'Ceiling Light', model: 'LED · GPIO5', type: 'light', state: false, available: true },
      { id: 'living_fan', name: 'Ventilation Fan', model: 'Fan · GPIO9', type: 'fan', state: false, available: true }
    ],
    sensors: [
      { id: 'living_temp', name: 'Ambient Temperature', model: 'DHT11 · GPIO4', value: 'No Data', unit: '°C', type: 'temperature', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'living_humidity', name: 'Relative Humidity', model: 'DHT11 · GPIO4', value: 'No Data', unit: '%', type: 'humidity', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'living_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2 · GPIO1', value: 'No Data', type: 'smoke', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'living_ap', name: 'ESP32 Edge Gateway', model: 'ESP32-S3', value: 'No Data', type: 'gateway', status: 'NO DATA', source: 'No Data (ESP32-S3)' }
    ]
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    description: 'Cooking, dining & high-priority fire monitoring zone',
    devices: [
      { id: 'kitchen_light', name: 'Kitchen Light', model: 'LED · GPIO7', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'kitchen_temp', name: 'Kitchen Temperature', model: 'DHT11 · GPIO4', value: 'No Data', unit: '°C', type: 'temperature', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'kitchen_humidity', name: 'Relative Humidity', model: 'DHT11 · GPIO4', value: 'No Data', unit: '%', type: 'humidity', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'kitchen_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2 · GPIO1', value: 'No Data', type: 'smoke', status: 'NO DATA', source: 'No Data (ESP32-S3)' }
    ]
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    description: 'Sleeping quarters & nighttime environmental monitoring',
    devices: [
      { id: 'bedroom_light', name: 'Bedroom Light', model: 'LED · GPIO6', type: 'light', state: false, available: true }
    ],
    sensors: [
      { id: 'bedroom_temp', name: 'Bedroom Temperature', model: 'DHT11 · GPIO4', value: 'No Data', unit: '°C', type: 'temperature', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'bedroom_humidity', name: 'Relative Humidity', model: 'DHT11 · GPIO4', value: 'No Data', unit: '%', type: 'humidity', status: 'NO DATA', source: 'No Data (ESP32-S3)' },
      { id: 'bedroom_smoke', name: 'Smoke & Gas Detector', model: 'MQ-2 · GPIO1', value: 'No Data', type: 'smoke', status: 'NO DATA', source: 'No Data (ESP32-S3)' }
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
