import cv2, numpy as np

def clean(name):
    img = cv2.imread(f"{name}.png", cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    S, V = hsv[:,:,1].astype(int), hsv[:,:,2].astype(int)
    out = img.copy()
    out[(S > 35) & (V > 45)] = (255,255,255)      # any colored ink
    gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    out[gray > 205] = (255,255,255)                # ghosts / anti-alias residue -> pure paper
    # two passes of small-blob removal (text chars, symbol ticks)
    for _ in range(2):
        gray = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
        dark = (gray < 165).astype(np.uint8)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
        kill = np.zeros(n, bool)
        for i in range(1, n):
            x,y,bw,bh,area = stats[i]
            if bw <= 34 and bh <= 24: kill[i] = True
        out[kill[lab]] = (255,255,255)
    # crop the sheet: keep the drawing area, drop the title-block strip and outer margins
    x0,x1 = int(w*0.045), int(w*0.878)
    y0,y1 = int(h*0.02), int(h*0.985)
    out = out[y0:y1, x0:x1]
    cv2.imwrite(f"{name}_clean.png", out)
    print(name, "done")

for nm in ("f1","f2","f3","f4"):
    clean(nm)
