import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const noticesTable = sqliteTable('notices', {
	id: integer('id').notNull().primaryKey(),
	category: text('category').notNull(),
	department: text('department').notNull(),
	title: text('title').notNull(),
	content: text('content').notNull(),
	url: text('url').notNull(),
	date: text('date')
		.notNull()
		.default(sql`CURRENT_DATE`),
});

export type InsertNotice = typeof noticesTable.$inferInsert;
export type SelectNotice = typeof noticesTable.$inferSelect;
