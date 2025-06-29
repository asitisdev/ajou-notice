import * as cheerio from 'cheerio';
import { InsertNotice } from '../schema';
import { InlineData, ImageData, GenerativePart, GernerativeResponse } from '../types';
import { Buffer } from 'node:buffer';

export default class NoticeService {
	private readonly GOOGLE_API_KEY: string;
	private readonly BASE_URL = 'https://www.ajou.ac.kr/kr/ajou/notice.do';

	constructor(GOOGLE_API_KEY: string) {
		this.GOOGLE_API_KEY = GOOGLE_API_KEY;
	}

	private async summarizeNotice(title: string, content: string, images: ImageData[]): Promise<string> {
		for (const modelName of ['gemini-2.5-flash', 'gemini-2.5-flash-lite-preview-06-17']) {
			try {
				const parts: GenerativePart[] = [
					...images,
					{
						text: `다음은 아주대학교 공지사항 게시글입니다. 다음 지시사항에 따라 게시글의 내용을 간단히 요약해주세요:
1. 불렛포인트(-) 형식을 사용하여 최대 3줄의 *간결한* 문장으로 요약해주세요.
2. 주요 날짜, 장소 등 공지사항의 핵심 정보를 포함해주세요.
3. 예의바르고 친근한 어투의 *한국어*를 사용해주세요.

제목: ${title}
게시글 내용: ${content}`,
					},
				];

				const response = await fetch(
					`https://gateway.ai.cloudflare.com/v1/7ea22cec2b5f7e4f1628298e55006d09/ai/google-ai-studio/v1/models/${modelName}:generateContent`,
					{
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'X-goog-api-key': this.GOOGLE_API_KEY },
						body: JSON.stringify({ contents: [{ parts }] }),
					}
				);

				if (!response.ok) continue;

				const data = (await response.json()) as GernerativeResponse;
				const result = data.candidates[0].content.parts
					.map((part) => part.text || '')
					.join('\n')
					.split('\n')
					.filter((line: string) => line.trim().startsWith('- ') || line.trim().startsWith('* '))
					.map((line: string) => `✨ ${line.trim().slice(2).trim()}`)
					.join('\n');

				return result;
			} catch {
				continue;
			}
		}

		return '';
	}

	private async imageUrlToInlineData(imageUrl: string): Promise<InlineData> {
		const response = await fetch(imageUrl.startsWith('http') ? imageUrl : 'https://ajou.ac.kr' + imageUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
				Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5',
			},
		});

		return {
			data: Buffer.from(await response.arrayBuffer()).toString('base64'),
			mimeType: response.headers.get('content-type') || 'image/jpeg',
		};
	}

	public async getNotice(articleNo: number): Promise<{ content: string; summary: string }> {
		const params = new URLSearchParams([
			['mode', 'view'],
			['articleNo', articleNo.toString()],
		]);

		const response = await fetch(`${this.BASE_URL}?${params.toString()}`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
				Accept: 'text/html',
			},
			method: 'GET',
		});

		if (!response.ok) {
			throw new Error('공지사항 내용을 가져오는데 실패했습니다');
		}

		const $ = cheerio.load(await response.text());
		const title = $('.b-title').text();
		const content = $('div.b-content-box > div.fr-view')
			.find('p')
			.get()
			.map((e) => $(e).text())
			.join('\n')
			.trim();
		const images = await Promise.all(
			$('div.b-content-box > div.fr-view')
				.find('img')
				.get()
				.map((e) => $(e).attr('src'))
				.filter((img) => img !== undefined)
				.map(async (url) => ({
					inlineData: await this.imageUrlToInlineData(url),
				}))
		);

		const summary = await this.summarizeNotice(title, content, images);

		return { content, summary };
	}

	public async getNotices(latestId: number, articleOffset = 0, articleLimit = 20): Promise<InsertNotice[]> {
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
		const rows = $('table.board-table > tbody > tr').get();

		const promises: Promise<InsertNotice>[] = [];

		for (const row of rows) {
			const index = parseInt($(row).find('td.b-num-box').text().trim());
			const category = $(row).find('td.b-num-box + td').text().trim();
			const title = $(row).find('td.b-td-left > div.b-title-box > a').text().trim();
			const link = $(row).find('td.b-td-left > div.b-title-box > a').attr()?.href?.trim() || '';
			const department = $(row).find('td.b-no-right + td').text().trim();
			const date = $(row).find('td.b-no-right + td + td').text().trim();

			const articleNo = parseInt(link.match(/(?:[?&])articleNo=([^&]*)/)![1]);

			if (!index || articleNo <= latestId) continue;

			promises.push(
				this.getNotice(articleNo).then((notice) => {
					return {
						id: articleNo,
						title: title,
						category: category,
						department: department,
						url: `https://www.ajou.ac.kr/kr/ajou/notice.do?articleNo=${articleNo}&mode=view`,
						content: notice.content,
						summary: notice.summary,
						date: date,
					};
				})
			);
		}

		const articles = await Promise.all(promises);

		return articles;
	}
}
