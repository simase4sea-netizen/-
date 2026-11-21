import os, sys, json, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
sys.path.insert(0, os.path.dirname(__file__))
import importlib
CM = importlib.import_module(os.environ.get("CONTENT","content"))
POSTS = CM.POSTS
SP = "/tmp/claude-0/-home-user--/cebc66bb-03a5-556c-9d0e-3ff22925208d/scratchpad"
SRC, OUT = f"{SP}/src", f"{SP}/out/" + os.environ.get("MONTH","11月分")
FD = os.path.expanduser("~/fonts")
def F(w, s): return ImageFont.truetype(f"{FD}/mpr-japanese-{w}.ttf", s)
RED=(218,51,73); CREAM=(251,246,236); BROWN=(94,74,61); GREEN=(110,160,40); BLUE=(86,170,208); WHITE=(255,255,255)
W,H = 1080,1350
META = json.load(open(f"{SP}/build/meta.json")) if os.path.exists(f"{SP}/build/meta.json") else {}

def find(fid):
    for f in os.listdir(SRC):
        if f.startswith(fid): return f"{SRC}/{f}"
    raise FileNotFoundError(fid)

def load(fid):
    im = ImageOps.exif_transpose(Image.open(find(fid))).convert("RGB")
    m = META.get(fid, {})
    for (x1,y1,x2,y2) in m.get("blur", []):
        w,h = im.size
        box = (int(x1*w/100), int(y1*h/100), int(x2*w/100), int(y2*h/100))
        reg = im.crop(box)
        small = reg.resize((max(1,reg.width//18), max(1,reg.height//18)))
        reg = small.resize(reg.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(12))
        im.paste(reg, box)
    return im

def cover_fit(im, tw, th, fid=None):
    m = META.get(fid, {}) if fid else {}
    cx, cy = m.get("center", (50, 50))
    w,h = im.size; s = max(tw/w, th/h) * m.get("zoom", 1.0)
    im = im.resize((int(w*s)+1, int(h*s)+1), Image.LANCZOS)
    w,h = im.size
    x = min(max(int(w*cx/100 - tw/2), 0), w-tw); y = min(max(int(h*cy/100 - th/2), 0), h-th)
    return im.crop((x,y,x+tw,y+th))

def illust(name, size):
    for f in os.listdir(SRC):
        if f.startswith(name) and "_w" not in f:
            im = Image.open(f"{SRC}/{f}").convert("RGBA")
            if im.mode=="RGBA" and im.getextrema()[3][0]==255:  # 不透明なら白を抜く
                px = im.load()
                for yy in range(im.height):
                    for xx in range(im.width):
                        r,g,b,a = px[xx,yy]
                        if r>235 and g>235 and b>235: px[xx,yy]=(r,g,b,0)
            im.thumbnail((size,size), Image.LANCZOS); return im
    return None

def tw_(d, t, f): 
    b = d.textbbox((0,0), t, font=f); return b[2]-b[0]
def wrap(d, text, f, maxw):
    lines=[]
    for para in text.split("\n"):
        cur=""
        for ch in para:
            if tw_(d, cur+ch, f) > maxw and cur:
                # 行頭禁則
                if ch in "、。」）！？…ー": cur+=ch; continue
                lines.append(cur); cur=ch
            else: cur+=ch
        lines.append(cur)
    return lines
def mtext(d, xy, text, f, fill, maxw, lh=1.5, align="left"):
    x,y = xy; lines = wrap(d, text, f, maxw)
    for ln in lines:
        lx = x if align=="left" else x + (maxw - tw_(d, ln, f))//2
        d.text((lx,y), ln, font=f, fill=fill); y += int(f.size*lh)
    return y
def theight(d, text, f, maxw, lh=1.5): return len(wrap(d,text,f,maxw))*int(f.size*lh)

def logo_badge(canvas, xy, size=120):
    try:
        lg = Image.open(find("135_72WHvqFgOdmgF9dOXJT-8DplfpINK")).convert("RGBA"); lg.thumbnail((size,size), Image.LANCZOS)
        bg = Image.new("RGBA", (size+16,size+16), (0,0,0,0)); dd=ImageDraw.Draw(bg)
        dd.ellipse((0,0,size+15,size+15), fill=WHITE+(255,))
        bg.alpha_composite(lg, ((size+16-lg.width)//2, (size+16-lg.height)//2))
        canvas.paste(bg, xy, bg)
    except FileNotFoundError: pass

def pill(d, xy, text, f, fill, color=WHITE, pad=(26,12)):
    x,y = xy; w = tw_(d,text,f)
    d.rounded_rectangle((x,y,x+w+pad[0]*2,y+f.size+pad[1]*2+6), radius=(f.size+pad[1]*2)//2, fill=fill)
    d.text((x+pad[0], y+pad[1]), text, font=f, fill=color)
    return x+w+pad[0]*2

def footer(d, dark=False):
    d.text((60, H-70), "こどもだけの料理教室 ゆめつぼ", font=F(700,26), fill=WHITE if dark else BROWN)

def dots(d, y):  # 赤40・生成り35・緑15・青10の配色帯
    x=0
    for c,p in ((RED,.4),(CREAM,.35),(GREEN,.15),(BLUE,.10)):
        d.rectangle((x,y,x+int(W*p),y+14), fill=c); x+=int(W*p)

def s_cover(sl):
    c = Image.new("RGB",(W,H),CREAM)
    ph = cover_fit(load(sl["img"]), W, 980, sl["img"]); c.paste(ph,(0,0))
    d = ImageDraw.Draw(c)
    d.rectangle((0,960,W,H), fill=CREAM)
    dots(d, 960)
    pill(d, (60, 905-60), sl["tag"], F(800,34), RED)
    y = mtext(d, (60, 1005), sl["title"], F(800,64), RED, W-120, lh=1.28)
    if sl.get("sub"): d.text((62, y+8), sl["sub"], font=F(700,32), fill=BROWN)
    logo_badge(c, (W-170, 30), 120)
    return c

def s_photo(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c)
    ph = cover_fit(load(sl["img"]), W-80, 900, sl["img"])
    mask = Image.new("L", ph.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0,0)+ph.size, 36, fill=255)
    c.paste(ph, (40,40), mask)
    y = 980
    x = 60
    if sl.get("step"):
        d.ellipse((60,y,140,y+80), fill=RED); d.text((100,y+40), sl["step"], font=F(800,48), fill=WHITE, anchor="mm"); x = 165
    d.text((x, y+8), sl["head"], font=F(800,54), fill=RED)
    mtext(d, (60, y+110), sl["body"], F(500,36), BROWN, W-120, lh=1.55)
    footer(d); return c

def s_text(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c)
    dots(d, 0)
    ill = illust(sl.get("illust","food_tsubo"), 300)
    if ill: c.paste(ill, ((W-ill.width)//2, 160), ill)
    y = 520
    y = mtext(d, (80,y), sl["head"], F(800,62), RED, W-160, lh=1.3, align="center") + 40
    d.line((W//2-60, y, W//2+60, y), fill=GREEN, width=6); y += 50
    y = mtext(d, (80,y), sl["body"], F(500,40), BROWN, W-160, lh=1.65, align="center")
    if sl.get("note"): mtext(d, (80,y+30), sl["note"], F(500,28), BROWN, W-160, align="center")
    footer(d); return c

def s_textcover(sl):
    c = Image.new("RGB",(W,H),RED); d = ImageDraw.Draw(c)
    d.rounded_rectangle((50,50,W-50,H-50), 40, fill=CREAM)
    pill(d, (100,110), sl["tag"], F(800,36), RED)
    ill = illust(sl.get("illust","food_tsubo"), 260)
    if ill: c.paste(ill, (W-100-ill.width, 820), ill)
    d.text((90, 300), "“", font=F(800,200), fill=(240,200,205))
    y = mtext(d, (100, 420), sl["title"], F(800,70), RED, W-200, lh=1.35)
    d.text((100, y+40), sl["sub"], font=F(700,36), fill=BROWN)
    logo_badge(c, (90, H-250), 120)
    return c

def s_quote(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c)
    pill(d, (80,100), sl["label"], F(700,32), GREEN)
    d.text((70, 170), "“", font=F(800,220), fill=(240,200,205))
    fs = 52 if len(sl["quote"])<50 else 46 if len(sl["quote"])<90 else 42
    f = F(700,fs); h = theight(d, sl["quote"], f, W-200, 1.75)
    y = max(400, (H-h)//2)
    y = mtext(d, (100,y), sl["quote"], f, BROWN, W-200, lh=1.75)
    if sl.get("who"): mtext(d, (100,y+40), "ー "+sl["who"], F(500,30), RED, W-200)
    ill = illust(sl.get("illust","food_tsubo"), 180)
    if ill: c.paste(ill, (W-ill.width-70, H-ill.height-60), ill)
    d.rectangle((0,H-14,W,H), fill=RED)
    footer(d); return c

def s_fit(sl):
    c = Image.new("RGB",(W,H),CREAM)
    im = load(sl["img"]); im.thumbnail((W-160, H-120), Image.LANCZOS)
    c.paste(im, ((W-im.width)//2, (H-im.height)//2)); return c

def s_chara(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c); dots(d,0)
    pill(d, (70,90), sl["tag"], F(800,38), RED)
    y = mtext(d, (70,200), sl["title"], F(800,70), RED, W-140, lh=1.32)
    try:
        ch = Image.open(find("1igveMOKQfLKXKwL5czPXVOt9eNItPGho")).convert("RGBA"); ch.thumbnail((620,760), Image.LANCZOS)
        c.paste(ch, (W-ch.width-40, H-ch.height-40), ch)
    except FileNotFoundError: pass
    logo_badge(c, (70, H-260), 170)
    return c

def s_list(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c); dots(d,0)
    y = mtext(d, (80,130), sl["head"], F(800,64), RED, W-160, lh=1.25) + 60
    for i,it in enumerate(sl["items"]):
        h = theight(d, it, F(700,42), W-300, 1.4)
        d.rounded_rectangle((80,y,W-80,y+h+60), 30, fill=WHITE)
        mark = str(i+1) if sl.get("numbered") else "✓"
        d.ellipse((110,y+20,180,y+90), fill=RED if not sl.get("pending") else BLUE)
        if sl.get("numbered"): d.text((145,y+55), mark, font=F(800,38), fill=WHITE, anchor="mm")
        else: d.line([(127,y+56),(141,y+70),(165,y+40)], fill=WHITE, width=8, joint="curve")
        mtext(d, (210,y+30), it, F(700,42), BROWN, W-310, lh=1.4); y += h+90
    if sl.get("pending"): d.text((80,y+10), "＊ 本部のご確認後に内容を入れます", font=F(700,30), fill=RED)
    ill = illust(sl.get("illust","food_ninjin"), 220)
    if ill: c.paste(ill, (W-ill.width-70, H-ill.height-70), ill)
    footer(d); return c

def s_end(sl):
    c = Image.new("RGB",(W,H),RED); d = ImageDraw.Draw(c)
    logo_badge(c, ((W-300)//2, 170), 280)
    d.text((W//2, 600), "こどもだけの料理教室", font=F(700,44), fill=WHITE, anchor="mm")
    d.text((W//2, 690), "ゆめつぼ", font=F(800,110), fill=WHITE, anchor="mm")
    d.rounded_rectangle((140,850,W-140,980), 65, fill=CREAM)
    d.text((W//2, 915), "教室のことは プロフィールから", font=F(800,44), fill=RED, anchor="mm")
    d.text((W//2, 1060), "保存して、あとで見返してね", font=F(500,34), fill=WHITE, anchor="mm")
    try:
        ch = Image.open(find("1igveMOKQfLKXKwL5czPXVOt9eNItPGho")).convert("RGBA"); ch.thumbnail((260,260), Image.LANCZOS)
        c.paste(ch, (W-ch.width-40, H-ch.height-20), ch)
    except FileNotFoundError: pass
    return c

def rmask(ph, r=28):
    m = Image.new("L", ph.size, 0); ImageDraw.Draw(m).rounded_rectangle((0,0)+ph.size, r, fill=255); return m
def s_gridcover(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c)
    g=16; cw=(W-80-g)//2; ch=(900-g)//2
    for i,fid in enumerate(sl["imgs"][:4]):
        ph = cover_fit(load(fid), cw, ch, fid); x=40+(i%2)*(cw+g); y=40+(i//2)*(ch+g)
        c.paste(ph,(x,y),rmask(ph))
    dots(d, 960)
    pill(d, (60, 990), sl["tag"], F(800,34), RED)
    y = mtext(d, (60, 1065), sl["title"], F(800,60), RED, W-120, lh=1.25)
    if sl.get("sub"): d.text((62, y+6), sl["sub"], font=F(700,30), fill=BROWN)
    logo_badge(c, (W-170, H-180), 120)
    return c
def s_grid(sl):
    c = Image.new("RGB",(W,H),CREAM); d = ImageDraw.Draw(c)
    n=len(sl["imgs"]); g=20
    if n==2: cells=[(40,40,(W-80-g)//2,880),(40+(W-80-g)//2+g,40,(W-80-g)//2,880)]
    else:
        cw=(W-80-g)//2; ch=(880-g)//2; cells=[(40+(i%2)*(cw+g),40+(i//2)*(ch+g),cw,ch) for i in range(4)]
    for i,(x,y,w,h) in enumerate(cells):
        fid=sl["imgs"][i]; ph=cover_fit(load(fid), w, h, fid); c.paste(ph,(x,y),rmask(ph))
        if sl.get("labels"):
            lb=sl["labels"][i]; f=F(800,30); tw=tw_(d,lb,f)
            d.rounded_rectangle((x+16,y+h-70,x+16+tw+40,y+h-16),27,fill=CREAM); d.text((x+36,y+h-62),lb,font=f,fill=RED)
    d.text((60, 960), sl["head"], font=F(800,54), fill=RED)
    if sl.get("body"): mtext(d, (60, 1060), sl["body"], F(500,36), BROWN, W-120, lh=1.55)
    footer(d); return c
R = dict(gridcover=s_gridcover, grid=s_grid, cover=s_cover, photo=s_photo, text=s_text, textcover=s_textcover, quote=s_quote, fit=s_fit, chara=s_chara, list=s_list, end=s_end)

def reel(p, d):
    RW,RH = 1080,1920; tmp = f"{d}/_frames"; os.makedirs(tmp, exist_ok=True)
    clips=[]
    for i,fr in enumerate(p["frames"]):
        c = Image.new("RGB",(RW,RH),RED)
        if not fr.get("end"):
            ph = cover_fit(load(fr["img"]), int(RW*1.12), int(RH*1.12), fr["img"]); c.paste(ph,(0,0))
        c.save(f"{tmp}/{i}.png")
        # テロップは別レイヤー（ズームさせない）
        t = Image.new("RGBA",(RW,RH),(0,0,0,0)); dd = ImageDraw.Draw(t)
        if fr.get("end"):
            logo_badge(t, ((RW-300)//2, 520), 280)
            mtext(dd, (80, 960), fr["text"], F(800,84), WHITE, RW-160, lh=1.35, align="center")
            dd.rounded_rectangle((160,1300,RW-160,1430), 65, fill=CREAM)
            dd.text((RW//2,1365), "教室のことは プロフィールから", font=F(800,46), fill=RED, anchor="mm")
        else:
            f = F(800,78); h = theight(dd, fr["text"], f, RW-200, 1.35)
            y0 = 1240
            dd.rounded_rectangle((60, y0-40, RW-60, y0+h+30), 40, fill=CREAM+(235,))
            mtext(dd, (100,y0), fr["text"], f, RED, RW-200, lh=1.35, align="center")
            logo_badge(t, (RW-180, 120), 110)
        t.save(f"{tmp}/{i}_t.png")
        dur = 2.6 if not fr.get("end") else 3.0
        out = f"{tmp}/{i}.mp4"
        zoom = "zoompan=z='min(zoom+0.0009,1.08)':d=%d:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=%dx%d:fps=30" % (int(dur*30), RW, RH)
        subprocess.run(["ffmpeg","-y","-loglevel","error","-loop","1","-i",f"{tmp}/{i}.png","-loop","1","-i",f"{tmp}/{i}_t.png",
            "-filter_complex", f"[0]{zoom}[bg];[bg][1]overlay=0:0,format=yuv420p,fade=t=in:st=0:d=0.25", "-t", str(dur), "-r","30","-c:v","libx264","-pix_fmt","yuv420p",out], check=True)
        clips.append(out)
        if i==0: Image.alpha_composite(c.convert("RGBA"), t).convert("RGB").save(f"{d}/表紙.png")
    with open(f"{tmp}/list.txt","w") as fl:
        for cl in clips: fl.write(f"file '{cl}'\n")
    subprocess.run(["ffmpeg","-y","-loglevel","error","-f","concat","-safe","0","-i",f"{tmp}/list.txt","-f","lavfi","-i","anullsrc=r=44100:cl=stereo","-shortest","-c:v","copy","-c:a","aac",f"{d}/リール.mp4"], check=True)
    subprocess.run(["rm","-rf",tmp])

def main(only=None):
    for p in POSTS:
        if only and p["no"] not in only: continue
        d = f"{OUT}/{p['no']}_{'フィード' if p['kind']=='feed' else 'リール'}_{p['title'].replace('/','／')}"
        os.makedirs(d, exist_ok=True)
        if p["kind"]=="feed":
            for i,sl in enumerate(p["slides"]):
                R[sl["type"]](sl).save(f"{d}/{i+1:02d}.png")
        else: reel(p, d)
        open(f"{d}/キャプション.txt","w").write(p["caption"].strip()+"\n\n"+CM.TAGS+"\n")
        print("done", p["no"])
if __name__=="__main__": main(sys.argv[1:] or None)
