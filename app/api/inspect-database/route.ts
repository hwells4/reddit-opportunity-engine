import { NextResponse } from "next/server";
import { Client } from "@notionhq/client";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export async function GET() {
  try {
    if (!process.env.NOTION_DATABASE_ID) {
      return NextResponse.json(
        { error: "NOTION_DATABASE_ID not configured" },
        { status: 500 }
      );
    }

    const database = await notion.databases.retrieve({
      database_id: process.env.NOTION_DATABASE_ID!,
    });

    const properties = Object.keys(database.properties).map(key => {
      const prop = database.properties[key];
      return {
        name: key,
        type: prop.type,
        ...(prop.type === 'select' && {
          options: prop.select?.options?.map((opt: any) => opt.name) || []
        })
      };
    });

    return NextResponse.json({
      success: true,
      database: {
        id: database.id,
        title: (database as any).title?.[0]?.plain_text || 'Untitled Database',
        properties: properties,
      },
      recommendations: {
        message: "Your database structure will work! The API will automatically adapt to these properties:",
        adaptations: properties.map(prop => {
          if (prop.type === 'title') return `✅ "${prop.name}" will be used for the page title`;
          if (prop.name.toLowerCase().includes('email')) return `✅ "${prop.name}" will store client email`;
          if (prop.name.toLowerCase().includes('status')) return `✅ "${prop.name}" will track completion status`;
          if (prop.name.toLowerCase().includes('date')) return `✅ "${prop.name}" will store generation date`;
          if (prop.name.toLowerCase().includes('subreddit') || prop.name.toLowerCase().includes('reddit')) return `✅ "${prop.name}" will store subreddit info`;
          if (prop.name.toLowerCase().includes('id')) return `✅ "${prop.name}" will store run/job ID`;
          return `ℹ️ "${prop.name}" (${prop.type}) will be skipped unless manually mapped`;
        })
      }
    });

  } catch (error) {
    console.error("Error inspecting database:", error);
    return NextResponse.json(
      { 
        error: "Failed to inspect database",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 