declare module 'xlsx-populate' {
    interface Workbook {
        sheet(name: string): Sheet;
        outputAsync(): Promise<Buffer>;
    }

    interface Sheet {
        cell(ref: string): Cell;
    }

    interface Cell {
        value(value: string | number | boolean | Date | null): Cell;
    }

    function fromDataAsync(data: Buffer): Promise<Workbook>;

    const xlsxPopulate = {
        fromDataAsync
    };

    export default xlsxPopulate;
} 