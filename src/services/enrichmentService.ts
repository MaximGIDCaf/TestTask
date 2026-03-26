import { Property, PropertyId, EnrichedPropertyResult, RealtorRating, PropertyPhoto, PropertyTax } from '../models/types';
import { logError } from '../utils/logger';

export class EnrichmentService {
  private async fetchRealtorRating(propertyId: PropertyId): Promise<RealtorRating | null> {
    // Simulate API call with timeout
    await this.delay(Math.random() * 500);
    
    // Simulate random failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Realtor rating service unavailable');
    }
    
    return {
      propertyId,
      rating: Math.random() * 5,
      reviewsCount: Math.floor(Math.random() * 100),
    };
  }

  private async fetchPhotos(propertyId: PropertyId): Promise<PropertyPhoto[]> {
    await this.delay(Math.random() * 500);
    
    if (Math.random() < 0.1) {
      throw new Error('Photo service unavailable');
    }
    
    return [
      {
        propertyId,
        url: `https://example.com/photos/${propertyId}/main.jpg`,
        isMain: true,
      },
    ];
  }

  private async fetchTaxData(propertyId: PropertyId): Promise<PropertyTax> {
    await this.delay(Math.random() * 300);
    
    // Critical source - fail more often for testing
    if (Math.random() < 0.15) {
      throw new Error('Tax service unavailable');
    }
    
    return {
      propertyId,
      taxAmount: Math.random() * 10000,
      taxYear: 2024,
    };
  }

  async enrichProperty(property: Property): Promise<EnrichedPropertyResult> {
    const timeout = 3000; // 3 seconds total timeout

    const tasks = {
      realtorRating: this.fetchRealtorRating(property.id).catch(error => {
        logError(error, `Non-critical: Realtor rating failed for ${property.id}`);
        return null;
      }),
      photos: this.fetchPhotos(property.id).catch(error => {
        logError(error, `Non-critical: Photos failed for ${property.id}`);
        return [];
      }),
      tax: this.fetchTaxData(property.id),
    };

    // Race against timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Enrichment timeout')), timeout);
    });

    try {
      const result = await Promise.race([
        Promise.all([
          Promise.resolve(property),
          tasks.realtorRating,
          tasks.photos,
          tasks.tax,
        ]),
        timeoutPromise,
      ]) as [Property, RealtorRating | null, PropertyPhoto[], PropertyTax];

      const [prop, realtorRating, photos, tax] = result;

      return {
        property: {
          ...prop,
          realtorRating: realtorRating || undefined,
          photos: photos.length > 0 ? photos : undefined,
          tax,
        },
        hasRealtorRating: !!realtorRating,
        hasPhotos: photos.length > 0,
        hasTax: true,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Enrichment timeout') {
        logError(error, `Enrichment timeout for property ${property.id}`);
      }
      
      // Check if critical sources failed
      const taxFailed = error instanceof Error && error.message.includes('Tax');
      if (taxFailed) {
        throw new Error(`Critical source failed for ${property.id}: ${error}`);
      }
      
      // Return partial data for non-critical failures
      const partialResult = await this.getPartialEnrichment(property, tasks);
      if (partialResult) return partialResult;
      
      throw error;
    }
  }

  private async getPartialEnrichment(
    property: Property,
    tasks: any
  ): Promise<EnrichedPropertyResult | null> {
    try {
      const [realtorRating, photos, tax] = await Promise.allSettled([
        tasks.realtorRating,
        tasks.photos,
        tasks.tax,
      ]);

      // At minimum we need property and tax
      if (tax.status === 'rejected') {
        return null;
      }

      return {
        property: {
          ...property,
          realtorRating: realtorRating.status === 'fulfilled' ? realtorRating.value : undefined,
          photos: photos.status === 'fulfilled' ? photos.value : undefined,
          tax: tax.value,
        },
        hasRealtorRating: realtorRating.status === 'fulfilled',
        hasPhotos: photos.status === 'fulfilled',
        hasTax: true,
      };
    } catch {
      return null;
    }
  }

  async enrichProperties(properties: Property[]): Promise<EnrichedPropertyResult[]> {
    const enrichmentPromises = properties.map(prop => 
      this.enrichProperty(prop).catch(error => {
        logError(error, `Failed to enrich property ${prop.id}`);
        return null;
      })
    );

    const results = await Promise.all(enrichmentPromises);
    return results.filter((result): result is EnrichedPropertyResult => result !== null);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EnrichmentService;