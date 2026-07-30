import sys
import os
import gmsh
import trimesh

def convert_step_to_glb(in_file, out_file):
    obj_file = out_file.replace(".glb", ".obj")
    
    # 1. Convert STEP to OBJ using Gmsh
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0) # Suppress output
    gmsh.merge(in_file)
    gmsh.model.mesh.generate(2) # 2D surface mesh
    gmsh.write(obj_file)
    gmsh.finalize()
    
    # 2. Convert OBJ to GLB using Trimesh
    scene = trimesh.load(obj_file)
    scene.export(out_file)
    
    # Clean up the intermediate OBJ
    if os.path.exists(obj_file):
        os.remove(obj_file)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: convert_step.py <in_file.step> <out_file.glb>")
        sys.exit(1)
        
    in_step = sys.argv[1]
    out_glb = sys.argv[2]
    try:
        convert_step_to_glb(in_step, out_glb)
        print("Success")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
