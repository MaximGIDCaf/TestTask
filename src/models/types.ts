// Branded types for type safety
export type PropertyId = string & { readonly __brand: 'PropertyId' };
export type UserId = string & { readonly __brand: 'UserId' };

export type PropertyType = 'apartment' | 'house' | 'commercial';

export interface Property {
  id: PropertyId;
  title: string;
  price: number;
  area: number;
  district: string;
  type: PropertyType;
  rooms?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyHistory {
  id: string;
  propertyId: PropertyId;
  price: number;
  changeDate: Date;
  changePercent?: number;
}

export interface Favorite {
  userId: UserId;
  propertyId: PropertyId;
  createdAt: Date;
}

export interface SearchFilters {
  query?: string; 
  district?: string;
  minPrice?: number;
  maxPrice?: number;
  type?: PropertyType;
  minArea?: number;
  maxArea?: number;
  rooms?: number;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  items: Property[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Types for parallel loading task
export interface RealtorRating {
  propertyId: PropertyId;
  rating: number;
  reviewsCount: number;
}

export interface PropertyPhoto {
  propertyId: PropertyId;
  url: string;
  isMain: boolean;
}

export interface PropertyTax {
  propertyId: PropertyId;
  taxAmount: number;
  taxYear: number;
}

export interface EnrichedProperty extends Property {
  realtorRating?: RealtorRating;
  photos?: PropertyPhoto[];
  tax?: PropertyTax;
}

export interface EnrichedPropertyResult {
  property: EnrichedProperty;
  hasRealtorRating: boolean;
  hasPhotos: boolean;
  hasTax: boolean;
}