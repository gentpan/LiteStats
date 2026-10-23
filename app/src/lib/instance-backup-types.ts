export type FullBackupSummary={createdAt:string;sites:number;users:number;events:number;release:string}
export type FullBackupItem={id:string;bytes:number;createdAt:string;summary?:FullBackupSummary}
export type FullBackupList={available:boolean;items:FullBackupItem[];active:string|null;maxUploadBytes:number}
export type FullBackupJob={id:string;kind:"backup"|"verify"|"restore";archive:string;state:"prepared"|"running"|"succeeded"|"failed";phase:string;summary?:FullBackupSummary;error?:string;ticket?:string}
