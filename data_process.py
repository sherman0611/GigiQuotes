import psycopg2

def replace_word_with_casing(word_to_fix, target_word):
    """
    Replaces a word while preserving its casing (lowercase, Capitalized, or UPPERCASE)
    in the 'content' column of the 'quotes' table.
    """
    connection_params = {
        "host": "127.0.0.1",
        "database": "gigi_quotes_db",
        "user": "postgres",
        "password": "0000"
    }

    # Prepare the variations
    variants = [
        (word_to_fix.lower(), target_word.lower()),
        (word_to_fix.capitalize(), target_word.capitalize()),
        (word_to_fix.upper(), target_word.upper())
    ]

    conn = None
    try:
        conn = psycopg2.connect(**connection_params)
        cur = conn.cursor()

        total_affected = 0
        
        # We iterate through the variations to ensure exact case matching
        for old, new in variants:
            sql = """
                UPDATE quotes 
                SET content = REPLACE(content, %s, %s)
                WHERE content LIKE %s;
            """
            search_pattern = f"%{old}%"
            cur.execute(sql, (old, new, search_pattern))
            total_affected += cur.rowcount

        conn.commit()
        print(f"Update complete. Total instances modified: {total_affected}")

    except Exception as e:
        print(f"An error occurred: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()

if __name__ == '__main__':
    # This will now fix 'yowie', 'Yowie', and 'YOWIE' correctly.
    replace_word_with_casing("yowie", "yaoi")