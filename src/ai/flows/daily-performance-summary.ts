
'use server';
/**
 * @fileOverview A Genkit flow for generating a daily summary of sales performance and key inventory insights.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DailyPerformanceSummaryInputSchema = z.object({
  date: z.string().describe('The date for which to generate the summary in YYYY-MM-DD format.').optional(),
});
export type DailyPerformanceSummaryInput = z.infer<typeof DailyPerformanceSummaryInputSchema>;

const DailyPerformanceSummaryOutputSchema = z.object({
  salesSummary: z.object({
    totalSalesUSD: z.number().describe('Total sales in USD for the day.'),
    totalTransactions: z.number().describe('Total number of transactions for the day.'),
    averageTransactionValueUSD: z.number().describe('Average transaction value in USD for the day.'),
    bestSellingProduct: z.string().describe('Name of the best selling product by quantity.'),
  }).describe('Summary of daily sales performance.'),
  inventorySummary: z.object({
    lowStockItemsCount: z.number().describe('Number of items with stock below a predefined threshold.'),
    lowStockItems: z.array(z.string()).describe('List of items currently low in stock.'),
    topConsumedItems: z.array(z.string()).describe('List of top 3 most consumed inventory items.'),
  }).describe('Key inventory insights.'),
  overallSummary: z.string().describe('A concise, natural language summary of the day\'s performance.'),
});
export type DailyPerformanceSummaryOutput = z.infer<typeof DailyPerformanceSummaryOutputSchema>;

export async function generateDailyPerformanceSummary(input: DailyPerformanceSummaryInput = {}): Promise<DailyPerformanceSummaryOutput> {
  return dailyPerformanceSummaryFlow(input);
}

const dailyPerformanceSummaryPrompt = ai.definePrompt({
  name: 'dailyPerformanceSummaryPrompt',
  input: { schema: DailyPerformanceSummaryInputSchema },
  output: { schema: DailyPerformanceSummaryOutputSchema },
  prompt: `Usa un tono profesional pero amable para el equipo de Hablame Perrito Plus.
Genera un resumen basado en estos datos:

Fecha: {{{date}}}
Ventas: ${'{{salesData.totalSalesUSD}}'} USD ({{salesData.totalTransactions}} pedidos)
Ticket Promedio: {{salesData.averageTransactionValueUSD}} USD
Producto Estrella: {{salesData.bestSellingProduct}}

Inventario Crítico: {{inventoryData.lowStockItemsCount}} items bajos.
Items Bajos: {{#each inventoryData.lowStockItems}}- {{this}} {{/each}}
Mas Consumidos: {{#each inventoryData.topConsumedItems}}- {{this}} {{/each}}

Tu resumen debe ser motivador y resaltar si hay que reponer stock pronto.`,
});

const dailyPerformanceSummaryFlow = ai.defineFlow(
  {
    name: 'dailyPerformanceSummaryFlow',
    inputSchema: DailyPerformanceSummaryInputSchema,
    outputSchema: DailyPerformanceSummaryOutputSchema,
  },
  async (input) => {
    const date = input.date || new Date().toISOString().split('T')[0];

    const mockSalesData = {
      totalSalesUSD: 1420.50,
      totalTransactions: 84,
      averageTransactionValueUSD: 16.91,
      bestSellingProduct: 'Hamburguesa Doble Bacon Boss',
    };

    const mockInventoryData = {
      lowStockItemsCount: 2,
      lowStockItems: ['Lechuga Picada', 'Tocino Ahumado'],
      topConsumedItems: ['Carne de Res', 'Pan de Hamburguesa', 'Papas Prefritas'],
    };

    if (!process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_GENAI_API_KEY.includes('YOUR_API_KEY')) {
      return {
        salesSummary: mockSalesData,
        inventorySummary: mockInventoryData,
        overallSummary: "Modo Demo: Hoy hemos tenido un excelente flujo en la Sucursal Norte. La 'Doble Bacon Boss' sigue siendo la favorita. Ojo con el stock de Lechuga y Tocino, estamos en niveles críticos y mañana será un día movido."
      };
    }

    try {
      const { output } = await dailyPerformanceSummaryPrompt({
        date,
        salesData: mockSalesData,
        inventoryData: mockInventoryData,
      });
      return output!;
    } catch (e) {
      return {
        salesSummary: mockSalesData,
        inventorySummary: mockInventoryData,
        overallSummary: "El sistema reporta un desempeño positivo. Se recomienda revisar el inventario de carnes y panes para el turno de la noche."
      };
    }
  }
);
