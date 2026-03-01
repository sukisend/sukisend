import { Platform } from 'react-native';

import { CategorySales, Order, SalesMetrics } from '../types/models';

interface ExportPayload {
  rangeLabel: string;
  generatedBy: string;
  metrics: SalesMetrics;
  categorySales: CategorySales[];
  transactions: Order[];
}

type ExportHandler = (payload: ExportPayload) => Promise<void>;

const reportService =
  Platform.OS === 'web'
    ? (require('./reportService.web') as {
        exportSalesReportXLSX: ExportHandler;
        exportSalesReportPDF: ExportHandler;
      })
    : (require('./reportService.native') as {
        exportSalesReportXLSX: ExportHandler;
        exportSalesReportPDF: ExportHandler;
      });

export const exportSalesReportXLSX = reportService.exportSalesReportXLSX;
export const exportSalesReportPDF = reportService.exportSalesReportPDF;
export const exportSalesReportCSV = reportService.exportSalesReportXLSX;
