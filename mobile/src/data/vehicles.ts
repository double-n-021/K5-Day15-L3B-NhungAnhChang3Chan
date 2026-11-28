import type { Vehicle, VehicleId } from '@/types';

export const VEHICLES: Record<VehicleId, Vehicle> = {
  vfe34: {
    id: 'vfe34',
    category: 'car',
    name: 'VinFast VF e34',
    brand: 'VinFast',
    segment: 'Crossover hạng C · Pin LFP',
    paintName: 'Trắng Ngọc Trai · Cổng CCS2',
    usableBatteryKwh: 41.9,
    wltpRangeKm: 318,
    baseConsumptionKwhPer100Km: 14.4,
    maxDcPowerKw: 65,
    connectorType: 'CCS2',
    fastChargeNote: 'Sạc nhanh DC 10% -> 70% trong ~27 phút (mô phỏng)',
    angles: [
      {
        id: 'front34',
        label: 'Góc trước',
        source: require('../../assets/vehicles/vfe34-studio-front34.jpg'),
      },
      {
        id: 'rear34',
        label: 'Góc sau',
        source: require('../../assets/vehicles/vfe34-studio-rear34.jpg'),
      },
    ],
  },
  vinfast_evo200: {
    id: 'vinfast_evo200',
    category: 'motorbike',
    name: 'VinFast Evo200 2023',
    brand: 'VinFast',
    segment: 'Xe máy điện đô thị · Pin LFP 3.5 kWh',
    paintName: 'Bạc Xanh Electric · Đời 2023',
    usableBatteryKwh: 3.5,
    wltpRangeKm: 203,
    baseConsumptionKwhPer100Km: 1.9,
    maxDcPowerKw: 1.0,
    connectorType: 'Pin LFP / AC 220V',
    fastChargeNote: 'Sạc nhanh 1000W ~4h đầy bình hoặc nạp nhanh 25p đi phố (mô phỏng)',
    angles: [
      {
        id: 'front34',
        label: 'Góc trước',
        source: require('../../assets/vehicles/evo200-front34.jpg'),
      },
    ],
  },
};

export const VEHICLE_LIST: Vehicle[] = [VEHICLES.vfe34, VEHICLES.vinfast_evo200];
