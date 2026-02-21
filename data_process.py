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
        word_to_fix.lower(),
        word_to_fix.capitalize(),
        word_to_fix.upper(),
    ]

    conn = None
    try:
        conn = psycopg2.connect(**connection_params)
        cur = conn.cursor()

        total_affected = 0
        
        # We iterate through the variations to ensure exact case matching
        for variant in variants:
            sql = """
                UPDATE quotes 
                SET content = REPLACE(content, %s, %s)
                WHERE content LIKE %s;
            """
            search_pattern = f"%{variant}%"
            cur.execute(sql, (variant, target_word, search_pattern))
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
    replace_word_with_casing("So see the immigrants", "Cecilia Immergreen")
    replace_word_with_casing("more coliope", "Mori Calliope")
    replace_word_with_casing("league of legends", "League of Legends")
    replace_word_with_casing("callie", "Calli")
    replace_word_with_casing("muddin", "Murin")
    replace_word_with_casing("jiji", "Gigi")
    replace_word_with_casing("Gigi tomo", "Gigi-Tomo")
    replace_word_with_casing("yowi", "yaoi")
    replace_word_with_casing("immigreen", "Immergreen")
    replace_word_with_casing("mcgrew", "Immergreen")
    replace_word_with_casing("ebbinggwee", "Immergreen")
    replace_word_with_casing("emmergreen", "Immergreen")
    replace_word_with_casing("emmergree", "Immergreen")
    replace_word_with_casing("ceci", "Cece")
    replace_word_with_casing("seci", "Cece")
    replace_word_with_casing("grams", "grems")
    replace_word_with_casing("gram", "grem")
    replace_word_with_casing("Oral Crony", "Ouro Kronii")