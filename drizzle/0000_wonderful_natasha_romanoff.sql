CREATE TABLE `farm_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`observation_key` text NOT NULL,
	`verdict` text NOT NULL,
	`reason` text,
	`clarity` text NOT NULL,
	`reservoir_key` text NOT NULL,
	`reservoir_name` text NOT NULL,
	`observation_date` text NOT NULL,
	`action_title` text NOT NULL,
	`action_tone` text NOT NULL,
	`crop` text NOT NULL,
	`stage` text NOT NULL,
	`moisture` text NOT NULL,
	`data_source` text NOT NULL,
	`current_rate` real NOT NULL,
	`water_status` text NOT NULL,
	`three_day_rain` real,
	`forecast_decision` text NOT NULL,
	`forecast_adoption` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `farm_feedback_participant_observation_idx` ON `farm_feedback` (`participant_id`,`observation_key`);--> statement-breakpoint
CREATE INDEX `farm_feedback_reservoir_idx` ON `farm_feedback` (`reservoir_key`);--> statement-breakpoint
CREATE INDEX `farm_feedback_created_at_idx` ON `farm_feedback` (`created_at`);