#!/bin/bash
OUTPUT_FILE="all_code.txt"
echo "Project Code Export" > $OUTPUT_FILE
echo "===================" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

find src server.ts -type f -name "*.ts" -o -name "*.tsx" -o -name "*.css" | while read -r file; do
    echo "File: $file" >> $OUTPUT_FILE
    echo "---------------------------------------------------" >> $OUTPUT_FILE
    cat "$file" >> $OUTPUT_FILE
    echo "" >> $OUTPUT_FILE
    echo "===================================================" >> $OUTPUT_FILE
    echo "" >> $OUTPUT_FILE
done
