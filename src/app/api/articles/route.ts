import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export async function GET() {
  try {
    const rssUrl =
      "https://news.google.com/rss/search?q=online+scam+OR+social+media+privacy+OR+cybersecurity+OR+data+breach&hl=en-IN&gl=IN&ceid=IN:en";

    const res = await fetch(rssUrl, { next: { revalidate: 3600 } });
    const xml = await res.text();

    const parser = new XMLParser();
    const data = parser.parse(xml);
    const rawItems = data?.rss?.channel?.item ?? [];

    const articles = rawItems.slice(0, 12).map((item: any) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      source: item.source?.["#text"] ?? "Google News",
    }));

    return NextResponse.json({ articles });
  } catch (err) {
    return NextResponse.json(
      { articles: [], error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}