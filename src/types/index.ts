export interface Env {
	DB: D1Database;
	GOOGLE_API_KEY: string;
}

export interface ImageData {
	inlineData: InlineData;
}

export interface InlineData {
	data: string;
	mimeType: string;
}

export interface TextData {
	text: string;
}

export type GenerativePart = ImageData | TextData;

export interface GernerativeResponse {
	candidates: {
		content: {
			parts: TextData[];
		};
	}[];
}
