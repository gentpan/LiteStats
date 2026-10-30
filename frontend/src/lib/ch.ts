// Public display types retained from the original UI. There is no ClickHouse client in this edition.
export type Overview={visitors:number;session_visitors:number;pageviews:number;visits:number;bounce_rate:number;views_per_visit:number;visit_duration:number;live:number}
export type MetricKey="visitors"|"visits"|"pageviews"|"views_per_visit"|"bounce_rate"|"visit_duration"
export type Point={date:string;value:number}
export type SeriesBy=Record<MetricKey,Point[]>&{session_visitors:Point[]}
export type Row={name:string;value:number;code?:string;label?:string}
export type RecentEvent={name:string;pathname:string;source:string;country:string;browser:string;os:string;device:string;time:string}
export type RecentVisitor={id:string;pathname:string;source:string;country:string;browser:string;os:string;device:string;screen:string;language:string;firstSeen:string;lastSeen:string;active:boolean;pageviews:number;events:number;pages:string[]}
export type EventSummary={total:number;events:Row[];downloadsTotal:number;downloads:Row[];outboundTotal:number;outbound:Row[];properties:Row[]}
