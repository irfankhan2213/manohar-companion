export interface ProductConfig {
  name: string;
  shortName: string;
  defaultTenantName: string;
  accentColor: string;
  supportPhone: string;
}

export const PRODUCT_CONFIG: ProductConfig = {
  name: 'Manohar Companion',
  shortName: 'Manohar',
  defaultTenantName: 'Manohar Trading Group',
  accentColor: '#0F6B66',
  supportPhone: '+91 98765 43210',
};
