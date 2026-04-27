'use server';
/**
 * @fileOverview Provides AI-powered suggestions for optimal ingredient reorder quantities.
 *
 * - generateStockReorderSuggestions - A function that handles the generation of stock reorder suggestions.
 * - StockReorderSuggestionsInput - The input type for the generateStockReorderSuggestions function.
 * - StockReorderSuggestionsOutput - The return type for the generateStockReorderSuggestions function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IngredientSchema = z.object({
  id: z.string().describe('Unique identifier for the ingredient.').nonempty(),
  name: z.string().describe('Name of the ingredient.').nonempty(),
  currentStock: z.number().int().min(0).describe('Current quantity of the ingredient in stock at this location.'),
  locationId: z.string().describe('ID of the location where this ingredient is stocked.').nonempty(),
  reorderThreshold: z.number().int().min(0).optional().describe('Optional: The stock level at which a reorder should be triggered.'),
  leadTimeDays: z.number().int().min(0).optional().describe('Optional: Number of days it takes for a reorder to arrive.'),
});

const SalesRecordSchema = z.object({
  ingredientId: z.string().describe('ID of the ingredient sold.').nonempty(),
  date: z.string().datetime().describe('Date and time of the sale in ISO 8601 format.'),
  quantitySold: z.number().int().min(1).describe('Quantity of the ingredient sold.'),
  locationId: z.string().describe('ID of the location where the sale occurred.').nonempty(),
});

const StockReorderSuggestionsInputSchema = z.object({
  currentInventory: z.array(IngredientSchema).describe('An array of current ingredient stock levels across various locations.').min(1),
  historicalSalesData: z.array(SalesRecordSchema).describe('An array of historical sales records for ingredients.').min(1),
  forecastPeriodDays: z.number().int().min(1).default(7).describe('The number of days into the future for which to forecast demand and suggest reorders. Defaults to 7 days.'),
});

export type StockReorderSuggestionsInput = z.infer<typeof StockReorderSuggestionsInputSchema>;

const ReorderSuggestionSchema = z.object({
  ingredientId: z.string().describe('The unique identifier of the ingredient to reorder.').nonempty(),
  ingredientName: z.string().describe('The name of the ingredient.').nonempty(),
  locationId: z.string().describe('The ID of the location where the ingredient needs to be reordered.').nonempty(),
  reorderQuantity: z.number().int().min(0).describe('The suggested quantity to reorder for this ingredient at this location.'),
  reason: z.string().optional().describe('An optional explanation for the reorder suggestion.'),
});

const StockReorderSuggestionsOutputSchema = z.object({
  suggestions: z.array(ReorderSuggestionSchema).describe('An array of recommended reorder quantities for ingredients across locations.').optional(),
});

export type StockReorderSuggestionsOutput = z.infer<typeof StockReorderSuggestionsOutputSchema>;

export async function generateStockReorderSuggestions(input: StockReorderSuggestionsInput): Promise<StockReorderSuggestionsOutput> {
  return stockReorderSuggestionsFlow(input);
}

const stockReorderPrompt = ai.definePrompt({
  name: 'stockReorderPrompt',
  input: { schema: StockReorderSuggestionsInputSchema },
  output: { schema: StockReorderSuggestionsOutputSchema },
  prompt: `You are an expert inventory manager for a fast-food chain. Your goal is to provide optimal reorder suggestions for ingredients across different locations to minimize waste and prevent stockouts.

Analyze the provided current inventory, historical sales data, and a forecast period.

**Current Inventory:**
${'```json'}
{{{JSON.stringify currentInventory}}}
${'```'}

**Historical Sales Data:**
${'```json'}
{{{JSON.stringify historicalSalesData}}}
${'```'}

**Forecast Period (days):** {{{forecastPeriodDays}}}

Based on this information, provide reorder suggestions. Consider factors like average daily consumption, lead times, and current stock levels compared to reorder thresholds. Aim to maintain enough stock for the forecast period plus a safety margin.`,
});

const stockReorderSuggestionsFlow = ai.defineFlow(
  {
    name: 'stockReorderSuggestionsFlow',
    inputSchema: StockReorderSuggestionsInputSchema,
    outputSchema: StockReorderSuggestionsOutputSchema,
  },
  async (input) => {
    // Check for API key presence to prevent crash
    if (!process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY.includes('YOUR_API_KEY')) {
      const suggestions = input.currentInventory
        .filter(item => item.currentStock < (item.reorderThreshold || 20))
        .map(item => ({
          ingredientId: item.id,
          ingredientName: item.name,
          locationId: item.locationId,
          reorderQuantity: 50,
          reason: "Modo Demo: El stock está por debajo del umbral de seguridad."
        }));
      return { suggestions };
    }

    try {
      const { output } = await stockReorderPrompt(input);
      return output!;
    } catch (e) {
      const suggestions = input.currentInventory
        .filter(item => item.currentStock < (item.reorderThreshold || 20))
        .map(item => ({
          ingredientId: item.id,
          ingredientName: item.name,
          locationId: item.locationId,
          reorderQuantity: 25,
          reason: "Sugerencia de respaldo: Stock bajo detectado."
        }));
      return { suggestions };
    }
  }
);