CREATE TABLE `notices` (
	`id` integer PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`department` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`url` text NOT NULL,
	`date` text DEFAULT CURRENT_DATE NOT NULL
);
