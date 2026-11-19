export class CreateLoanDto {

  private constructor(
    public userId: number,
    public bookId: number,
    public dueDate: Date
  ) {}

  static create ( object: {[key: string]: any} ):[string?, CreateLoanDto?] {
    const { userId, bookId, dueDate } = object;
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return ['Invalid or missing userId'];
    }
    if (!Number.isSafeInteger(bookId) || bookId <= 0) {
      return ['Invalid or missing bookId'];
    }
    if (!(dueDate instanceof Date) || isNaN(dueDate.getTime())) {
      return ['Invalid or missing dueDate'];
    }
    if (dueDate <= new Date()) {
      return ['dueDate must be a future date'];
    }
    return [undefined, new CreateLoanDto(userId, bookId, dueDate)];
  }

}
