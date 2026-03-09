export interface WarehouseManager {
  _id: string;
  name: string;
  email: string;
  role: string;
}

export interface Warehouse {
  _id: string;
  name: string;
  address: string;
  description?: string;
  managerIds: WarehouseManager[];
  active: boolean;
  capacity: number;
  maxTransactionPriceLimit: number;
  createdAt: string;
  updatedAt: string;
}
