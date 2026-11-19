'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('concurrent loans preserve duplicate, member limit, return and stock rules', {
  skip: process.env.QA_DATABASE_TESTS !== '1' ? 'Set QA_DATABASE_TESTS=1 with local QA PostgreSQL running' : false,
  timeout: 30000,
}, async () => {
  const { db } = require('../../dist/data/postgres/knex');
  const { LoanModel } = require('../../dist/data/postgres/models/loan.model');
  const { LoanService } = require('../../dist/presentation/services/loan.service');
  const service = new LoanService();
  const userIds = [];
  const bookIds = [];
  let categoryId;
  const prefix = `REGRESSION-${Date.now()}`;
  const dueDate = new Date(Date.now() + 7 * 86400000);
  function checkResults(results, successes) {
    assert.equal(results.filter(r => r.status === 'fulfilled').length, successes);
    for (const result of results.filter(r => r.status === 'rejected')) assert.equal(result.reason.statusCode, 400);
  }
  try {
    for (let i = 0; i < 4; i++) {
      const [user] = await db('users').insert({ name: prefix, email: `${prefix}-${i}@eowyn.test`, password: 'unused', role: ['USER_ROLE'] }).returning('id');
      userIds.push(user.id);
    }
    const [category] = await db('categories').insert({ name: prefix, description: prefix, user_id: userIds[0] }).returning('id');
    categoryId = category.id;
    for (let i = 0; i < 6; i++) {
      const quantity = i === 0 ? 5 : 1;
      const [book] = await db('books').insert({ title: `${prefix}-${i}`, author: prefix, isbn: `${prefix}-${i}`, publication_year: 2020, category_id: categoryId, user_id: userIds[0], total_quantity: quantity, available_quantity: quantity }).returning('id');
      bookIds.push(book.id);
    }
    const sameBook = await Promise.allSettled(Array.from({ length: 8 }, () => service.createLoan({ userId: userIds[0], bookId: bookIds[0], dueDate })));
    checkResults(sameBook, 1);
    const firstLoan = sameBook.find(r => r.status === 'fulfilled').value;
    checkResults(await Promise.allSettled(Array.from({ length: 8 }, () => service.returnLoan(firstLoan.id))), 1);
    assert.equal((await db('books').where({ id: bookIds[0] }).first()).available_quantity, 5);
    const differentBooks = await Promise.allSettled(bookIds.slice(0, 5).map(bookId => service.createLoan({ userId: userIds[0], bookId, dueDate })));
    checkResults(differentBooks, 3);
    for (const loan of differentBooks.filter(r => r.status === 'fulfilled')) await service.returnLoan(loan.value.id);
    const scarceBook = await Promise.allSettled(userIds.map(userId => LoanModel.createLoanWithTransaction({ userId, bookId: bookIds[5], dueDate })));
    checkResults(scarceBook, 1);
    assert.equal((await db('books').where({ id: bookIds[5] }).first()).available_quantity, 0);
  } finally {
    try {
      if (userIds.length) await db('loans').whereIn('user_id', userIds).delete();
      if (bookIds.length) await db('books').whereIn('id', bookIds).delete();
      if (categoryId) await db('categories').where({ id: categoryId }).delete();
      if (userIds.length) await db('users').whereIn('id', userIds).delete();
    } finally {
      await db.destroy();
    }
  }
});
