import re
import database as db

def collapse_repetitive_phrases():
    """
    Identifies phrases that repeat consecutively in a quote 
    and collapses them into a single occurrence.
    Example: "It's crazy. It's crazy." -> "It's crazy."
    """
    conn = None
    try:
        conn = db.connect()
        cur = conn.cursor()

        # 1. Fetch all quotes that need processing
        cur.execute("SELECT id, content FROM quotes")
        rows = cur.fetchall()

        total_affected = 0

        # Regular Expression Breakdown:
        # (\b.+\b) -> Capture a group of text starting and ending at word boundaries
        # [.,!? ]* -> Match optional punctuation or spaces between repetitions
        # \1       -> Match the exact same text captured in group 1
        # +        -> Match one or more repetitions
        # re.IGNORECASE is used to catch "It's crazy. it's crazy."
        re_pattern = r'(\b.+\b)([.,!? ]+\1)+'

        for quote_id, content in rows:
            # We use a loop to handle multiple different repeated phrases in one quote
            new_content = re.sub(re_pattern, r'\1', content, flags=re.IGNORECASE)
            
            if new_content != content:
                cur.execute(
                    "UPDATE quotes SET content = %s WHERE id = %s",
                    (new_content, quote_id)
                )
                total_affected += 1

        conn.commit()
        print(f"Cleanup complete. Total quotes de-duplicated: {total_affected}")

    except Exception as e:
        print(f"An error occurred during deduplication: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()

def replace_word_with_casing(word_to_fix, target_word):
    """
    Replaces a word while preserving its casing (lowercase, Capitalized, or UPPERCASE)
    in the 'content' column of the 'quotes' table.
    """
    # Prepare the variations
    variants = [
        word_to_fix.lower(),
        word_to_fix.capitalize(),
        word_to_fix.upper(),
    ]

    conn = None
    try:
        conn = db.connect()
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
    replace_word_with_casing("cc", "Cece")
    replace_word_with_casing("cici", "Cece")

    replace_word_with_casing("grams", "grems")
    replace_word_with_casing("gram", "grem")

    replace_word_with_casing("Oral Crony", "Ouro Kronii")
    replace_word_with_casing("jimoonie", "Gimurin")
    replace_word_with_casing("jimunin", "Gimurin")

    # collapse_repetitive_phrases()