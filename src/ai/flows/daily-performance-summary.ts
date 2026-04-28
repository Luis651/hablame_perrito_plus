export type DailyPerformanceSummaryInput = any;
export type DailyPerformanceSummaryOutput = any;

export async function generateDailyPerformanceSummary(input: any = {}): Promise<any> {
  return {
    salesSummary: {
      totalSalesUSD: 0,
      totalTransactions: 0,
      averageTransactionValueUSD: 0,
      bestSellingProduct: '',
    },
    inventorySummary: {
      lowStockItemsCount: 0,
      lowStockItems: [],
      topConsumedItems: [],
    },
    overallSummary: "La IA de resumen diario está desactivada.",
  };
}
