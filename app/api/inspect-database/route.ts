/**
 * API route that provides a diagnostic and introspection tool for the Notion integration.
 * This endpoint allows a developer or administrator to inspect the structure of the
 * root Notion database that the application is configured to use.
 *
 * - GET /api/inspect-database:
 *   Retrieves the schema of the Notion database specified by the
 *   `NOTION_DATABASE_ID` environment variable.
 *
 *   The endpoint's workflow is as follows:
 *   1.  **Configuration Check**: Verifies that the `NOTION_DATABASE_ID` is set.
 *   2.  **Fetch Schema**: Calls the Notion API to retrieve the database's metadata.
 *   3.  **Parse Properties**: Extracts the name, type, and options (for 'select'
 *       columns) for every property in the database.
 *   4.  **Provide Feedback**: Returns a JSON object containing the parsed properties
 *       and a list of "recommendations" or "adaptations". This feedback explains
 *       how the application will attempt to map its data to the discovered
 *       database schema based on column names (e.g., a column named 'Status' will
 *       be used for tracking completion status).
 *
 *   This is a valuable tool for debugging setup issues with the Notion integration,
 *   providing immediate feedback on schema compatibility.
 */
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