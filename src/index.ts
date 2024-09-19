import * as cheerio from 'cheerio';
import { desc, and, or, eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { InsertNotice, noticesTable as notices } from './schema';

export interface Env {
	DB: D1Database;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const db = drizzle(env.DB);
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
			const values = await getNotices(latestId);

			for (const notice of values) {
				console.log(notice.id);
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

		const latestId = (await db.select({ id: notices.id }).from(notices).orderBy(desc(notices.id)).limit(1).get())?.id ?? 0;
		const values = await getNotices(latestId);

		for (const notice of values) {
			console.log(notice.id);
			await db.insert(notices).values(notice).onConflictDoNothing({ target: notices.id });
		}
	},
} satisfies ExportedHandler<Env>;

async function getArticleContent(articleNo: number): Promise<string> {
	const params = new URLSearchParams([
		['mode', 'view'],
		['articleNo', articleNo.toString()],
	]);

	const response = await fetch(`https://www.ajou.ac.kr/kr/ajou/notice.do?${params.toString()}`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
			Accept: 'text/html',
		},
		method: 'GET',
	});

	if (!response.ok) {
		throw new Error('공지사항 내용을 가져오는데 실패했습니다');
	}

	const $ = cheerio.load(await response.text());
	const content = $('div.b-content-box > div.fr-view')
		.find('p')
		.get()
		.map((e) => $(e).text())
		.join('\n')
		.trim();

	return content;
}

async function getNotices(latestId: number, articleOffset = 0, articleLimit = 20): Promise<InsertNotice[]> {
	const params = new URLSearchParams([
		['mode', 'list'],
		['articleLimit', articleLimit.toString()],
		['article.offset', articleOffset.toString()],
	]);

	const response = await fetch(`https://www.ajou.ac.kr/kr/ajou/notice.do?${params.toString()}`, {
		headers: {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
			Accept: 'text/html',
		},
		method: 'GET',
	});

	if (!response.ok) {
		throw new Error('공지사항 목록을 가져오는데 실패했습니다');
	}

	const $ = cheerio.load(await response.text());
	const $rows = $('table.board-table > tbody > tr');

	const total = parseInt($('div.b-total-wrap > p > span').first().text().trim().match(/\d+/)?.[0] || 'NaN');
	console.log(`Notice article total: ${total}`);

	const promises: Promise<InsertNotice>[] = [];

	$rows.each(function (i, e) {
		const index = parseInt($(this).find('td.b-num-box').text().trim());
		const category = $(this).find('td.b-num-box + td').text().trim();
		const title = $(this).find('td.b-td-left > div.b-title-box > a').text().trim();
		const link = $(this).find('td.b-td-left > div.b-title-box > a').attr()?.href?.trim() || '';
		const department = $(this).find('td.b-no-right + td').text().trim();
		const date = $(this).find('td.b-no-right + td + td').text().trim();

		const articleNo = parseInt(link.match(/(?:[?&])articleNo=([^&]*)/)![1]);

		if (!index || articleNo <= latestId) return;

		promises.push(
			getArticleContent(articleNo).then((content) => {
				return {
					id: articleNo,
					title: title,
					category: category,
					department: department,
					url: `https://www.ajou.ac.kr/kr/ajou/notice.do?articleNo=${articleNo}&mode=view`,
					content: content,
					date: date,
				};
			})
		);
	});

	const articles = await Promise.all(promises);

	return articles;
}
