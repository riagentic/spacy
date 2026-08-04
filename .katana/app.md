# Spacy

## General

- Spacy is the aio electron app that analyses and helps to free disk space

## Ui

- Small, compact and simple electron UI app written in aio framework (dep/aio)
- Shows utilization on all partitions the user can actually free space on
- Hides partitions nothing can be reclaimed from or diagnosed on: kernel/pseudo
  filesystems, read-only images (squashfs/iso9660/erofs), snap and AppImage
  bundle mounts, and encrypted overlays (ecryptfs/gocryptfs/…) whose contents
  are ciphertext. An unlocked LUKS volume carrying a normal filesystem is
  ordinary storage and is shown.
- Every partition can be selected and it shows top 10 folders that occupy most
  of the partition space
- When user clicks on folder, app jumps into the folder and shows top 10 (again)
  most occupied folders within that folder
- for each folder, there is also button "File Manager" that will open standard
  file manager in that folder, for Linux mint cinnamon -> nemo will be opened in
  that particular folder)
- ui is aesthetically pleasing, cool, intuitive and user friendly
- top10 folders are selected by size (largest first), limited to direct children
  only

## Safety

- App never deletes anything, it's purpose it to analyze and help to detect how
  partitions space is utilized
