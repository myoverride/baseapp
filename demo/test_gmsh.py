import gmsh
import trimesh
import sys

try:
    gmsh.initialize()
    # Create a box
    gmsh.model.occ.addBox(0, 0, 0, 10, 10, 10)
    gmsh.model.occ.synchronize()
    # Save to step to test reading
    gmsh.write("test_box.step")
    gmsh.finalize()

    # Now test reading step and converting to obj
    gmsh.initialize()
    # Suppress output
    gmsh.option.setNumber("General.Terminal", 0)
    gmsh.merge("test_box.step")
    gmsh.model.mesh.generate(2)
    gmsh.write("test_box.obj")
    gmsh.finalize()
    print("Gmsh obj generation success!")

    # Now use trimesh to read obj and export glb
    scene = trimesh.load("test_box.obj")
    scene.export("test_box.glb")
    print("Trimesh glb generation success!")
except Exception as e:
    print("Failed:", e)
