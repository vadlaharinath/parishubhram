import json
import psycopg2

DATABASE_URL = "postgresql://postgres.tcokwfncvcevoyvuklxa:21S116419chari@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

GEOJSON_PATH = r"C:\Users\HP\Projects\parishubhram\data\hyderabad\wards_hyderabad.geojson"

with open(GEOJSON_PATH, 'r', encoding='utf-8') as f:
    geojson_data = json.load(f)

features = geojson_data['features']
print(f"Found {len(features)} wards")

conn = psycopg2.connect(DATABASE_URL)
cursor = conn.cursor()
print("Connected to Supabase!")

cursor.execute("SELECT id FROM public.cities WHERE slug = 'hyderabad'")
result = cursor.fetchone()
city_id = result[0]
print(f"Hyderabad ID: {city_id}")

success_count = 0
error_count = 0

for i, feature in enumerate(features):
    try:
        props = feature['properties']

        ward_number = (
            props.get('ward_no') or
            props.get('ward_number') or
            props.get('WARD_NO') or
            props.get('wardno') or
            i + 1
        )

        ward_name = (
            props.get('ward_name') or
            props.get('WARD_NAME') or
            props.get('name') or
            props.get('NAME') or
            f"Ward {ward_number}"
        )

        geometry_json = json.dumps(feature['geometry'])

        cursor.execute("""
            INSERT INTO public.wards (city_id, ward_number, ward_name, geom)
            VALUES (
                %s, %s, %s,
                ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            )
            ON CONFLICT (city_id, ward_number) DO NOTHING
        """, (str(city_id), int(ward_number), str(ward_name), geometry_json))

        success_count += 1

        if (i + 1) % 10 == 0:
            print(f"Processed {i + 1}/{len(features)} wards...")

    except Exception as e:
        error_count += 1
        print(f"Ward {i+1} failed: {e}")
        continue

conn.commit()
cursor.close()
conn.close()

print(f"\nDone! Imported: {success_count} | Failed: {error_count}")