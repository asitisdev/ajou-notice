export interface Env {
	DB: D1Database;
	GOOGLE_API_KEY: string;
}

export interface ImageData {
	inlineData: {
		data: string;
		mimeType: string;
	};
}
