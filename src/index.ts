import { desc, and, or, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Env } from './types';
import { noticesTable as notices, noticesTable } from './schema';
import NoticeService from './services/noticeService';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const db = drizzle(env.DB);
		const noticeService = new NoticeService(env.GOOGLE_API_KEY);
		const { pathname, searchParams } = new URL(request.url);

		if (pathname === '/api/notices') {
			if (request.method === 'OPTIONS') {
				return new Response(null, {
					headers: {
						'Access-Control-Allow-Origin': '*',
						'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
						'Access-Control-Max-Age': '86400',
					},
				});
			}

			if (request.method !== 'GET') {
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						'Access-Control-Allow-Origin': '*',
						Allow: 'GET',
					},
				});
			}

			const page = parseInt(searchParams.get('page') || '1');
			const category = searchParams.get('category') || '';
			const department = searchParams.get('department') || '';
			const search = searchParams.get('search') || '';
			const pageSize = 10;
			const offset = (page - 1) * pageSize;

			const results = await db
				.select()
				.from(notices)
				.where(
					and(
						category ? eq(notices.category, category) : undefined,
						department ? eq(notices.department, department) : undefined,
						search ? or(like(notices.title, `%${search}%`), like(notices.content, `%${search}%`)) : undefined
					)
				)
				.limit(pageSize)
				.offset(offset)
				.orderBy(desc(notices.id))
				.all();

			return Response.json(results, {
				headers: {
					'Access-Control-Allow-Origin': '*',
				},
			});
		} else if (pathname === '/api/notices/refresh') {
			if (request.method !== 'POST') {
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						'Access-Control-Allow-Origin': '*',
						Allow: 'POST',
					},
				});
			}

			const latestId = (await db.select({ id: notices.id }).from(notices).orderBy(desc(notices.id)).limit(1).get())?.id ?? 0;
			const values = await noticeService.getNotices(latestId);

			for (const notice of values) {
				console.log(notice);
				await db.insert(notices).values(notice).onConflictDoNothing({ target: notices.id });
			}

			return Response.json(values, {
				headers: {
					'Access-Control-Allow-Origin': '*',
				},
			});
		}

		return new Response('Call GET /api/notices');
	},

	async scheduled(event, env, ctx) {
		const db = drizzle(env.DB);
		const noticeService = new NoticeService(env.GOOGLE_API_KEY);

		const latestId = (await db.select({ id: notices.id }).from(notices).orderBy(desc(notices.id)).limit(1).get())?.id ?? 0;
		const values = await noticeService.getNotices(latestId);

		for (const notice of values) {
			console.log(notice);
			await db.insert(notices).values(notice).onConflictDoNothing({ target: notices.id });
		}
	},
} satisfies ExportedHandler<Env>;
